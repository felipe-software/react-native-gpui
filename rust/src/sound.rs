use std::f32::consts::TAU;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde_json::Value;

use crate::platform_services::{env_nonempty, test_mode};

const MAX_CONCURRENT_SOUNDS: usize = 8;
const MAX_SOURCE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_SECONDS: usize = 120;
const URL_CACHE_ENTRIES: usize = 32;
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const OUTPUT_TAIL: Duration = Duration::from_millis(150);
const STALL_MARGIN: Duration = Duration::from_secs(3);
const PING_RATE: u32 = 48_000;
const PING_SECONDS: f32 = 0.32;

#[derive(Debug, Clone, PartialEq)]
pub struct Pcm {
    pub rate: u32,
    pub channels: u16,
    pub samples: Vec<f32>,
}

impl Pcm {
    pub fn frames(&self) -> usize {
        self.samples.len() / self.channels.max(1) as usize
    }
}

#[derive(serde::Deserialize)]
struct PlayRequest {
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    volume: Option<f64>,
}

pub fn play(args: Value) -> Result<(), String> {
    let request: PlayRequest =
        serde_json::from_value(args).map_err(|error| format!("invalid sound request: {error}"))?;
    let volume = parse_volume(request.volume)?;
    let source = request
        .source
        .filter(|source| !source.trim().is_empty())
        .unwrap_or_else(|| "ping".to_string());
    let _slot = PlaybackSlot::acquire()?;
    let pcm = load(&source)?;
    if let Some(dir) = env_nonempty("RNGPUI_FAKE_SOUND_DIR") {
        return write_fake_output(Path::new(&dir), &pcm, volume);
    }
    if test_mode() {
        return Ok(());
    }
    play_on_default_device(&pcm, volume)
}

fn parse_volume(volume: Option<f64>) -> Result<f32, String> {
    match volume {
        None => Ok(1.0),
        Some(value) if value.is_finite() && (0.0..=1.0).contains(&value) => Ok(value as f32),
        Some(value) => Err(format!("volume must be between 0 and 1, got {value}")),
    }
}

static ACTIVE_SOUNDS: AtomicUsize = AtomicUsize::new(0);

struct PlaybackSlot;

impl PlaybackSlot {
    fn acquire() -> Result<Self, String> {
        let previous = ACTIVE_SOUNDS.fetch_add(1, Ordering::SeqCst);
        if previous >= MAX_CONCURRENT_SOUNDS {
            ACTIVE_SOUNDS.fetch_sub(1, Ordering::SeqCst);
            return Err(format!(
                "{MAX_CONCURRENT_SOUNDS} sounds are already playing"
            ));
        }
        Ok(Self)
    }
}

impl Drop for PlaybackSlot {
    fn drop(&mut self) {
        ACTIVE_SOUNDS.fetch_sub(1, Ordering::SeqCst);
    }
}

fn load(source: &str) -> Result<Arc<Pcm>, String> {
    if source == "ping" {
        return Ok(ping());
    }
    let remote = source.starts_with("http://") || source.starts_with("https://");
    if remote {
        return load_url(source);
    }
    let path = if source.starts_with("file://") {
        url::Url::parse(source)
            .ok()
            .and_then(|url| url.to_file_path().ok())
            .ok_or_else(|| format!("invalid file URL {source}"))?
    } else {
        PathBuf::from(source)
    };
    let file = std::fs::File::open(&path)
        .map_err(|error| format!("cannot open {}: {error}", path.display()))?;
    let bytes = read_capped(file).map_err(|error| format!("{}: {error}", path.display()))?;
    decode(&bytes)
        .map(Arc::new)
        .map_err(|error| format!("{}: {error}", path.display()))
}

fn read_capped(reader: impl Read) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_SOURCE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("read failed: {error}"))?;
    if bytes.len() as u64 > MAX_SOURCE_BYTES {
        return Err(format!(
            "sound files are limited to {} MiB",
            MAX_SOURCE_BYTES / 1024 / 1024
        ));
    }
    Ok(bytes)
}

fn url_cache() -> &'static Mutex<Vec<(String, Arc<Pcm>)>> {
    static CACHE: OnceLock<Mutex<Vec<(String, Arc<Pcm>)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

fn cached_url(url: &str) -> Option<Arc<Pcm>> {
    let mut cache = url_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let index = cache.iter().position(|(cached, _)| cached == url)?;
    let entry = cache.remove(index);
    let pcm = entry.1.clone();
    cache.push(entry);
    Some(pcm)
}

fn remember_url(url: &str, pcm: Arc<Pcm>) {
    let mut cache = url_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache.retain(|(cached, _)| cached != url);
    cache.push((url.to_string(), pcm));
    if cache.len() > URL_CACHE_ENTRIES {
        cache.remove(0);
    }
}

fn load_url(url: &str) -> Result<Arc<Pcm>, String> {
    if let Some(pcm) = cached_url(url) {
        return Ok(pcm);
    }
    let agent = ureq::AgentBuilder::new().timeout(FETCH_TIMEOUT).build();
    let response = agent
        .get(url)
        .call()
        .map_err(|error| format!("cannot fetch {url}: {error}"))?;
    let bytes = read_capped(response.into_reader()).map_err(|error| format!("{url}: {error}"))?;
    let pcm = Arc::new(decode(&bytes).map_err(|error| format!("{url}: {error}"))?);
    remember_url(url, pcm.clone());
    Ok(pcm)
}

fn ping() -> Arc<Pcm> {
    static PING: OnceLock<Arc<Pcm>> = OnceLock::new();
    PING.get_or_init(|| Arc::new(synthesize_ping())).clone()
}

pub fn synthesize_ping() -> Pcm {
    let frames = (PING_RATE as f32 * PING_SECONDS) as usize;
    let fade_out = 0.02;
    let samples = (0..frames)
        .map(|frame| {
            let t = frame as f32 / PING_RATE as f32;
            let attack = (t / 0.004).min(1.0);
            let release = ((PING_SECONDS - t) / fade_out).clamp(0.0, 1.0);
            let body = (TAU * 1318.51 * t).sin() * (-t / 0.08).exp();
            let shimmer = 0.4 * (TAU * 2637.02 * t).sin() * (-t / 0.03).exp();
            let strike = 0.2 * (TAU * 3955.53 * t).sin() * (-t / 0.015).exp();
            0.3 * attack * release * (body + shimmer + strike)
        })
        .collect();
    Pcm {
        rate: PING_RATE,
        channels: 1,
        samples,
    }
}

pub fn decode(bytes: &[u8]) -> Result<Pcm, String> {
    let is_wav = bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE";
    if is_wav {
        return decode_wav(bytes);
    }
    Err(unsupported_format(bytes))
}

fn unsupported_format(bytes: &[u8]) -> String {
    let mpeg_frame = bytes.len() > 1 && bytes[0] == 0xFF && bytes[1] & 0xE0 == 0xE0;
    let kind = if bytes.starts_with(b"ID3") || mpeg_frame {
        "MP3"
    } else if bytes.starts_with(b"OggS") {
        "Ogg"
    } else if bytes.starts_with(b"fLaC") {
        "FLAC"
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        "MP4/AAC"
    } else {
        "this format"
    };
    format!("{kind} is not supported; Sound.play decodes WAV (PCM or float) files")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Encoding {
    Unsigned8,
    Signed16,
    Signed24,
    Signed32,
    Float32,
    Float64,
}

impl Encoding {
    fn from_format(tag: u16, bits: u16) -> Option<Self> {
        match (tag, bits) {
            (1, 8) => Some(Self::Unsigned8),
            (1, 16) => Some(Self::Signed16),
            (1, 24) => Some(Self::Signed24),
            (1, 32) => Some(Self::Signed32),
            (3, 32) => Some(Self::Float32),
            (3, 64) => Some(Self::Float64),
            _ => None,
        }
    }

    fn bytes(self) -> usize {
        match self {
            Self::Unsigned8 => 1,
            Self::Signed16 => 2,
            Self::Signed24 => 3,
            Self::Signed32 | Self::Float32 => 4,
            Self::Float64 => 8,
        }
    }

    fn sample(self, b: &[u8]) -> f32 {
        match self {
            Self::Unsigned8 => (b[0] as f32 - 128.0) / 128.0,
            Self::Signed16 => i16::from_le_bytes([b[0], b[1]]) as f32 / 32_768.0,
            Self::Signed24 => (i32::from_le_bytes([0, b[0], b[1], b[2]]) >> 8) as f32 / 8_388_608.0,
            Self::Signed32 => i32::from_le_bytes([b[0], b[1], b[2], b[3]]) as f32 / 2_147_483_648.0,
            Self::Float32 => f32::from_le_bytes([b[0], b[1], b[2], b[3]]),
            Self::Float64 => {
                f64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]) as f32
            }
        }
    }
}

struct WavFormat {
    encoding: Encoding,
    channels: u16,
    rate: u32,
}

fn le_u16(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([bytes[at], bytes[at + 1]])
}

fn le_u32(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;

fn parse_fmt(chunk: &[u8]) -> Result<WavFormat, String> {
    if chunk.len() < 16 {
        return Err("WAV fmt chunk is truncated".to_string());
    }
    let declared_tag = le_u16(chunk, 0);
    let channels = le_u16(chunk, 2);
    let rate = le_u32(chunk, 4);
    let bits = le_u16(chunk, 14);
    let tag = if declared_tag == WAVE_FORMAT_EXTENSIBLE {
        if chunk.len() < 26 {
            return Err("WAV extensible fmt chunk is truncated".to_string());
        }
        le_u16(chunk, 24)
    } else {
        declared_tag
    };
    let encoding = Encoding::from_format(tag, bits)
        .ok_or_else(|| format!("unsupported WAV encoding (format {tag}, {bits} bits)"))?;
    if !(1..=32).contains(&channels) {
        return Err(format!("unsupported WAV channel count {channels}"));
    }
    if !(1_000..=768_000).contains(&rate) {
        return Err(format!("unsupported WAV sample rate {rate}"));
    }
    Ok(WavFormat {
        encoding,
        channels,
        rate,
    })
}

fn decode_wav(bytes: &[u8]) -> Result<Pcm, String> {
    let mut format = None;
    let mut data = None;
    let mut offset = 12usize;
    while offset + 8 <= bytes.len() && (format.is_none() || data.is_none()) {
        let id = &bytes[offset..offset + 4];
        let declared = le_u32(bytes, offset + 4) as usize;
        let start = offset + 8;
        let end = start.saturating_add(declared).min(bytes.len());
        let chunk = &bytes[start..end];
        if id == b"fmt " {
            format = Some(parse_fmt(chunk)?);
        } else if id == b"data" {
            data = Some(chunk);
        }
        offset = start.saturating_add(declared).saturating_add(declared & 1);
    }
    let format = format.ok_or("WAV has no fmt chunk")?;
    let data = data.ok_or("WAV has no data chunk")?;
    let channels = format.channels as usize;
    let sample_bytes = format.encoding.bytes();
    let frame_bytes = sample_bytes * channels;
    let frames = (data.len() / frame_bytes).min(MAX_SECONDS * format.rate as usize);
    if frames == 0 {
        return Err("WAV has no audio frames".to_string());
    }
    let samples = data[..frames * frame_bytes]
        .chunks_exact(sample_bytes)
        .map(|raw| {
            let value = format.encoding.sample(raw);
            if value.is_finite() {
                value.clamp(-1.0, 1.0)
            } else {
                0.0
            }
        })
        .collect();
    Ok(Pcm {
        rate: format.rate,
        channels: format.channels,
        samples,
    })
}

pub fn encode_wav(rate: u32, channels: u16, samples: &[f32]) -> Vec<u8> {
    let data_bytes = (samples.len() * 2) as u32;
    let block_align = channels * 2;
    let byte_rate = rate * block_align as u32;
    let mut out = Vec::with_capacity(44 + data_bytes as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_bytes).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_bytes.to_le_bytes());
    for sample in samples {
        let scaled = (sample.clamp(-1.0, 1.0) * 32_767.0).round() as i16;
        out.extend_from_slice(&scaled.to_le_bytes());
    }
    out
}

static FAKE_SEQUENCE: AtomicUsize = AtomicUsize::new(0);

fn write_fake_output(dir: &Path, pcm: &Pcm, volume: f32) -> Result<(), String> {
    std::fs::create_dir_all(dir)
        .map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    let scaled: Vec<f32> = pcm.samples.iter().map(|sample| sample * volume).collect();
    let wav = encode_wav(pcm.rate, pcm.channels, &scaled);
    let index = FAKE_SEQUENCE.fetch_add(1, Ordering::SeqCst);
    let path = dir.join(format!("sound-{index:03}.wav"));
    let staging = dir.join(format!(".sound-{index:03}.wav.tmp"));
    std::fs::write(&staging, wav)
        .and_then(|()| std::fs::rename(&staging, &path))
        .map_err(|error| format!("cannot write {}: {error}", path.display()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChannelSource {
    Mix,
    Channel(usize),
    Silent,
}

fn channel_source(out_channel: usize, out_channels: usize, in_channels: usize) -> ChannelSource {
    if out_channels == 1 {
        return ChannelSource::Mix;
    }
    if out_channel < in_channels {
        return ChannelSource::Channel(out_channel);
    }
    if in_channels == 1 {
        return ChannelSource::Channel(0);
    }
    ChannelSource::Silent
}

pub fn render(pcm: &Pcm, out_rate: u32, out_channels: u16, volume: f32) -> Vec<f32> {
    let in_channels = pcm.channels.max(1) as usize;
    let out_channels = out_channels.max(1) as usize;
    let in_frames = pcm.frames();
    if in_frames == 0 || out_rate == 0 {
        return Vec::new();
    }
    let step = pcm.rate as f64 / out_rate as f64;
    let out_frames = ((in_frames as f64 / step).floor() as usize).max(1);
    let sources: Vec<ChannelSource> = (0..out_channels)
        .map(|channel| channel_source(channel, out_channels, in_channels))
        .collect();
    let mut out = Vec::with_capacity(out_frames * out_channels);
    for frame in 0..out_frames {
        let position = frame as f64 * step;
        let index = (position.floor() as usize).min(in_frames - 1);
        let next = (index + 1).min(in_frames - 1);
        let fraction = (position - index as f64) as f32;
        let sample = |channel: usize| {
            let current = pcm.samples[index * in_channels + channel];
            let following = pcm.samples[next * in_channels + channel];
            current + (following - current) * fraction
        };
        for source in &sources {
            let value = match source {
                ChannelSource::Mix => {
                    (0..in_channels).map(sample).sum::<f32>() / in_channels as f32
                }
                ChannelSource::Channel(channel) => sample(*channel),
                ChannelSource::Silent => 0.0,
            };
            out.push((value * volume).clamp(-1.0, 1.0));
        }
    }
    out
}

fn play_on_default_device(pcm: &Pcm, volume: f32) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("no audio output device")?;
    let supported = device
        .default_output_config()
        .map_err(|error| format!("audio output config: {error}"))?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let samples = render(pcm, config.sample_rate.0, config.channels, volume);
    match sample_format {
        cpal::SampleFormat::F32 => stream_samples::<f32>(&device, &config, samples),
        cpal::SampleFormat::F64 => stream_samples::<f64>(&device, &config, samples),
        cpal::SampleFormat::I8 => stream_samples::<i8>(&device, &config, samples),
        cpal::SampleFormat::I16 => stream_samples::<i16>(&device, &config, samples),
        cpal::SampleFormat::I32 => stream_samples::<i32>(&device, &config, samples),
        cpal::SampleFormat::I64 => stream_samples::<i64>(&device, &config, samples),
        cpal::SampleFormat::U8 => stream_samples::<u8>(&device, &config, samples),
        cpal::SampleFormat::U16 => stream_samples::<u16>(&device, &config, samples),
        cpal::SampleFormat::U32 => stream_samples::<u32>(&device, &config, samples),
        cpal::SampleFormat::U64 => stream_samples::<u64>(&device, &config, samples),
        other => Err(format!("unsupported output sample format {other:?}")),
    }
}

fn stream_samples<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: Vec<f32>,
) -> Result<(), String>
where
    T: cpal::SizedSample + cpal::FromSample<f32> + Send + 'static,
{
    let total = samples.len();
    let frames = total / config.channels.max(1) as usize;
    let duration = Duration::from_secs_f64(frames as f64 / config.sample_rate.0.max(1) as f64);
    let (finished, outcome) = flume::bounded::<Result<(), String>>(1);
    let failed = finished.clone();
    let mut position = 0usize;
    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                for slot in data.iter_mut() {
                    let value = samples.get(position).copied().unwrap_or(0.0);
                    *slot = T::from_sample(value);
                    position += 1;
                }
                if position >= total {
                    let _ = finished.try_send(Ok(()));
                }
            },
            move |error| {
                let _ = failed.try_send(Err(format!("audio output failed: {error}")));
            },
            None,
        )
        .map_err(|error| format!("cannot open audio output: {error}"))?;
    stream
        .play()
        .map_err(|error| format!("cannot start audio output: {error}"))?;
    let result = outcome
        .recv_timeout(duration + STALL_MARGIN)
        .unwrap_or_else(|_| Err("audio output stalled".to_string()));
    if result.is_ok() {
        std::thread::sleep(OUTPUT_TAIL);
    }
    drop(stream);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(channels: u16, frames: usize) -> Vec<f32> {
        (0..frames * channels as usize)
            .map(|i| ((i / channels as usize) as f32 * 0.05).sin() * 0.5)
            .collect()
    }

    fn wav_with(tag: u16, bits: u16, channels: u16, rate: u32, payload: &[u8]) -> Vec<u8> {
        let block_align = channels * bits / 8;
        let mut out = Vec::new();
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(4 + 8 + 16 + 8 + 8 + 4 + payload.len() as u32).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"LIST");
        out.extend_from_slice(&4u32.to_le_bytes());
        out.extend_from_slice(b"INFO");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&tag.to_le_bytes());
        out.extend_from_slice(&channels.to_le_bytes());
        out.extend_from_slice(&rate.to_le_bytes());
        out.extend_from_slice(&(rate * block_align as u32).to_le_bytes());
        out.extend_from_slice(&block_align.to_le_bytes());
        out.extend_from_slice(&bits.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        out.extend_from_slice(payload);
        out
    }

    #[test]
    fn ping_is_short_audible_and_clean_at_both_ends() {
        let ping = synthesize_ping();
        assert_eq!(ping.rate, PING_RATE);
        assert_eq!(ping.channels, 1);
        let seconds = ping.frames() as f32 / ping.rate as f32;
        assert!((0.25..0.5).contains(&seconds), "ping lasts {seconds}s");
        let peak = ping
            .samples
            .iter()
            .fold(0.0f32, |peak, s| peak.max(s.abs()));
        assert!((0.2..=0.6).contains(&peak), "ping peak {peak}");
        assert!(ping.samples[0].abs() < 0.01);
        assert!(ping.samples.last().unwrap().abs() < 0.001);
    }

    #[test]
    fn sixteen_bit_stereo_round_trips_through_the_encoder() {
        let samples = tone(2, 2205);
        let wav = encode_wav(22_050, 2, &samples);
        let pcm = decode(&wav).unwrap();
        assert_eq!(pcm.rate, 22_050);
        assert_eq!(pcm.channels, 2);
        assert_eq!(pcm.frames(), 2205);
        for (decoded, original) in pcm.samples.iter().zip(&samples) {
            assert!((decoded - original).abs() < 1.0 / 16_000.0);
        }
    }

    #[test]
    fn decodes_8_24_32_bit_pcm_float_and_extensible_wavs() {
        let u8_wav = wav_with(1, 8, 1, 8_000, &[0, 128, 255]);
        let u8_pcm = decode(&u8_wav).unwrap();
        assert_eq!(u8_pcm.samples, vec![-1.0, 0.0, 127.0 / 128.0]);

        let s24: Vec<u8> = [8_388_607i32, -8_388_608, 0]
            .iter()
            .flat_map(|v| v.to_le_bytes()[..3].to_vec())
            .collect();
        let s24_pcm = decode(&wav_with(1, 24, 1, 48_000, &s24)).unwrap();
        assert!((s24_pcm.samples[0] - 1.0).abs() < 1e-6);
        assert_eq!(s24_pcm.samples[1], -1.0);
        assert_eq!(s24_pcm.samples[2], 0.0);

        let s32: Vec<u8> = [i32::MIN, 0].iter().flat_map(|v| v.to_le_bytes()).collect();
        assert_eq!(
            decode(&wav_with(1, 32, 1, 44_100, &s32)).unwrap().samples,
            vec![-1.0, 0.0]
        );

        let f32s: Vec<u8> = [0.25f32, -0.5, 2.0]
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect();
        assert_eq!(
            decode(&wav_with(3, 32, 1, 44_100, &f32s)).unwrap().samples,
            vec![0.25, -0.5, 1.0]
        );

        let f64s: Vec<u8> = [0.75f64, f64::NAN]
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect();
        assert_eq!(
            decode(&wav_with(3, 64, 1, 44_100, &f64s)).unwrap().samples,
            vec![0.75, 0.0]
        );

        let mut extensible = wav_with(WAVE_FORMAT_EXTENSIBLE, 16, 1, 16_000, &[0, 64]);
        let fmt = extensible
            .windows(4)
            .position(|window| window == b"fmt ")
            .unwrap();
        let mut ext = vec![];
        ext.extend_from_slice(&22u16.to_le_bytes());
        ext.extend_from_slice(&16u16.to_le_bytes());
        ext.extend_from_slice(&4u32.to_le_bytes());
        ext.extend_from_slice(&1u16.to_le_bytes());
        ext.extend_from_slice(&[0; 14]);
        extensible.splice(fmt + 4..fmt + 8, 40u32.to_le_bytes());
        extensible.splice(fmt + 24..fmt + 24, ext);
        assert_eq!(decode(&extensible).unwrap().samples, vec![0.5]);
    }

    #[test]
    fn rejects_other_formats_with_a_clear_reason() {
        assert!(decode(b"ID3\x04\0\0\0\0").unwrap_err().contains("MP3"));
        assert!(decode(b"OggS\0\x02").unwrap_err().contains("Ogg"));
        assert!(decode(b"fLaC\0\0").unwrap_err().contains("FLAC"));
        assert!(decode(b"hello").unwrap_err().contains("WAV"));
        assert!(
            decode(&wav_with(2, 4, 1, 8_000, &[1, 2]))
                .unwrap_err()
                .contains("format 2")
        );
        assert!(
            decode(&wav_with(1, 16, 1, 8_000, &[]))
                .unwrap_err()
                .contains("no audio")
        );
    }

    #[test]
    fn render_resamples_and_maps_channels() {
        let mono = Pcm {
            rate: 24_000,
            channels: 1,
            samples: vec![0.0, 0.5, 1.0, 0.5],
        };
        let stereo = render(&mono, 48_000, 2, 1.0);
        assert_eq!(stereo.len(), 8 * 2);
        assert_eq!(&stereo[0..4], &[0.0, 0.0, 0.25, 0.25]);

        let wide = Pcm {
            rate: 48_000,
            channels: 2,
            samples: vec![1.0, -1.0, 0.5, 0.25],
        };
        assert_eq!(render(&wide, 48_000, 1, 1.0), vec![0.0, 0.375]);
        assert_eq!(
            render(&wide, 48_000, 4, 0.5),
            vec![0.5, -0.5, 0.0, 0.0, 0.25, 0.125, 0.0, 0.0]
        );
        let halved = render(&mono, 12_000, 1, 1.0);
        assert_eq!(halved, vec![0.0, 1.0]);
    }

    #[test]
    fn volume_is_validated() {
        assert_eq!(parse_volume(None), Ok(1.0));
        assert_eq!(parse_volume(Some(0.25)), Ok(0.25));
        assert!(parse_volume(Some(1.5)).is_err());
        assert!(parse_volume(Some(-0.1)).is_err());
    }

    #[test]
    fn missing_files_and_bad_urls_fail_before_any_output() {
        assert!(
            load("/definitely/not/here.wav")
                .unwrap_err()
                .contains("cannot open")
        );
        assert!(load("file://not a url").is_err());
    }
}
