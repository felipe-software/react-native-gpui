import type { ChatChannel } from "../channel/chat-channel";
import type { MentionsChannel } from "../channel/mentions-channel";
import { channelFromTarget, type IrcMessage } from "../irc/message";
import type { Tint } from "../messages/model";
import { buildNotice } from "../messages/notice";
import type { TwitchConnections } from "../twitch/connections";
import { markTiming } from "../util/timing";

export type DispatchDeps = {
    channel: (name: string) => ChatChannel | undefined;
    channels: () => Iterable<ChatChannel>;
    mentions: MentionsChannel;
    connections: TwitchConnections;
    selfLogin: () => string | undefined;
    now: () => number;
    onRoomId: (channel: ChatChannel, roomId: string) => void;
    onEmoteSets: (sets: string[]) => void;
    onWhisper?: (message: IrcMessage) => void;
};

export class IrcDispatcher {
    constructor(private readonly deps: DispatchDeps) {}

    handleRead(message: IrcMessage): void {
        switch (message.command) {
            case "PRIVMSG":
                this.withChannel(message, (channel) => channel.handlePrivmsg(message));
                return;
            case "USERNOTICE":
                this.withChannel(message, (channel) => channel.handleUserNotice(message));
                return;
            case "CLEARCHAT":
                this.withChannel(message, (channel) => channel.handleClearChat(message));
                return;
            case "CLEARMSG":
                this.withChannel(message, (channel) => channel.handleClearMsg(message));
                return;
            case "ROOMSTATE":
                this.withChannel(message, (channel) => this.roomState(channel, message));
                return;
            case "USERSTATE":
                this.withChannel(message, (channel) => channel.handleUserState(message));
                return;
            case "GLOBALUSERSTATE":
                this.deps.onEmoteSets((message.tags["emote-sets"] ?? "").split(",").filter(Boolean));
                return;
            case "NOTICE":
                this.notice(message, false);
                return;
            case "JOIN":
                if (this.isSelf(message)) this.withChannel(message, (channel) => channel.handleSelfJoin());
                else this.withChannel(message, (channel) => channel.handleJoinPart(message.nick, true));
                return;
            case "PART":
                if (this.isSelf(message)) this.withChannel(message, (channel) => channel.handleSelfPart());
                else this.withChannel(message, (channel) => channel.handleJoinPart(message.nick, false));
                return;
            case "WHISPER":
                this.deps.onWhisper?.(message);
                return;
        }
    }

    handleWrite(message: IrcMessage): void {
        if (message.command === "USERSTATE") {
            const name = channelFromTarget(message.params[0]);
            if (name) this.deps.connections.confirmSent(name);
            this.withChannel(message, (channel) => channel.handleUserState(message));
            return;
        }
        if (message.command === "NOTICE") this.notice(message, true);
    }

    private isSelf(message: IrcMessage): boolean {
        return message.nick.toLowerCase() === this.deps.connections.nick.toLowerCase();
    }

    private withChannel(message: IrcMessage, action: (channel: ChatChannel) => void): void {
        const name = channelFromTarget(message.params[0]);
        const channel = name ? this.deps.channel(name) : undefined;
        if (channel) action(channel);
    }

    private roomState(channel: ChatChannel, message: IrcMessage): void {
        const hadRoomId = !!channel.info().roomId;
        const roomId = channel.handleRoomState(message);
        markTiming("irc:roomstate", { channel: channel.name, roomId, hadRoomId });
        if (roomId && !hadRoomId) this.deps.onRoomId(channel, roomId);
    }

    private notice(message: IrcMessage, fromWrite: boolean): void {
        const name = channelFromTarget(message.params[0]);
        const target = name ? this.deps.channel(name) : undefined;
        const colorOf = (login: string): Tint => target?.tintFor(login) ?? "system";
        const result = buildNotice(message, this.deps.selfLogin(), colorOf, this.deps.now());
        if (result.loginFailed || result.broadcast) {
            for (const channel of this.deps.channels()) channel.handleNotice(result);
            if (result.broadcast && !result.loginFailed && result.message) this.deps.mentions.add({ ...result.message });
            return;
        }
        if (fromWrite && name && result.message) this.deps.connections.rejectSent(name, result.message.text);
        target?.handleNotice(result);
    }
}
