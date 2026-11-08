import recorded from "./recorded-lines.json";

export const RECORDED = recorded as Record<string, string>;

export const LINES = {
    privmsgKappa:
        "@badge-info=subscriber/14;badges=moderator/1,subscriber/0,bits/1000;color=#0000FF;display-name=Ronni;emotes=25:0-4,12-16/1902:6-10;first-msg=0;id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;mod=1;room-id=22484632;subscriber=1;tmi-sent-ts=1794168000000;turbo=0;user-id=12345678;user-type=mod :ronni!ronni@ronni.tmi.twitch.tv PRIVMSG #forsen :Kappa Keepo Kappa LuL @forsen, check https://Example.com/Path.",
    privmsgLocalized:
        "@badges=;color=;display-name=北京;emotes=;id=loc-1;room-id=22484632;tmi-sent-ts=1794168000100;user-id=40;user-type= :beijing!beijing@beijing.tmi.twitch.tv PRIVMSG #forsen :你好",
    privmsgZeroWidth:
        "@badges=;color=#FF0000;display-name=ZW;emotes=;id=zw-1;room-id=22484632;tmi-sent-ts=1794168000200;user-id=41;user-type= :zw!zw@zw.tmi.twitch.tv PRIVMSG #forsen :forsenBlunder SoSnowy RainTime",
    privmsgSelfMention:
        "@badges=;color=#00FF00;display-name=Pinger;emotes=;id=ping-1;room-id=22484632;tmi-sent-ts=1794168000300;user-id=42;user-type= :pinger!pinger@pinger.tmi.twitch.tv PRIVMSG #forsen :hey MyLogin how are you",
    privmsgCheer:
        "@badge-info=;badges=staff/1,bits/1000;bits=150;color=;display-name=ronni;emotes=;id=cheer-1;mod=0;room-id=22484632;subscriber=0;tmi-sent-ts=1794168000400;turbo=1;user-id=12345678;user-type=staff :ronni!ronni@ronni.tmi.twitch.tv PRIVMSG #forsen :cheer100 nice cheer50",
    privmsgReward:
        "@badges=;color=#123456;custom-reward-id=abc-reward;display-name=Redeemer;emotes=;id=reward-1;room-id=22484632;tmi-sent-ts=1794168000500;user-id=43;user-type= :redeemer!redeemer@redeemer.tmi.twitch.tv PRIVMSG #forsen :pls play song",
    privmsgElevated:
        "@badges=;color=#123456;display-name=Hyper;emotes=;id=hype-1;pinned-chat-paid-amount=500;pinned-chat-paid-currency=USD;pinned-chat-paid-exponent=2;pinned-chat-paid-level=ONE;room-id=22484632;tmi-sent-ts=1794168000550;user-id=44;user-type= :hyper!hyper@hyper.tmi.twitch.tv PRIVMSG #forsen :hype chat",
    privmsgEmoji: "@badges=;color=;display-name=Emo;emotes=;id=emoji-1;room-id=22484632;tmi-sent-ts=1794168000600;user-id=45;user-type= :emo!emo@emo.tmi.twitch.tv PRIVMSG #forsen :hi😀there ❤️ 👍🏽",
    subgift:
        "@badge-info=;badges=staff/1,premium/1;color=#0000FF;display-name=TWW2;emotes=;id=e9176cd8-5e22-4684-ad40-ce53c2561c5e;login=tww2;mod=0;msg-id=subgift;msg-param-months=1;msg-param-recipient-display-name=Mr_Woodchuck;msg-param-recipient-id=55554444;msg-param-recipient-user-name=mr_woodchuck;msg-param-sub-plan-name=House\\sof\\sNyoro~n;msg-param-sub-plan=1000;room-id=22484632;subscriber=0;system-msg=TWW2\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\sMr_Woodchuck!;tmi-sent-ts=1794168001000;turbo=0;user-id=87654321;user-type=staff :tmi.twitch.tv USERNOTICE #forsen",
    subgiftMultiMonth:
        "@badges=;color=#0000FF;display-name=TWW2;emotes=;id=gift-6;login=tww2;msg-id=subgift;msg-param-gift-months=6;msg-param-sender-count=12;msg-param-recipient-display-name=Mr_Woodchuck;msg-param-recipient-id=55554444;msg-param-recipient-user-name=mr_woodchuck;msg-param-sub-plan=2000;room-id=22484632;system-msg=TWW2\\sgifted\\s6\\smonths\\sof\\sTier\\s2\\sto\\sMr_Woodchuck.;tmi-sent-ts=1794168001100;user-id=87654321;user-type= :tmi.twitch.tv USERNOTICE #forsen",
    submysterygift:
        "@badges=;color=;display-name=AnAnonymousGifter;emotes=;id=mystery-1;login=ananonymousgifter;mod=0;msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-sub-plan=1000;room-id=22484632;subscriber=0;system-msg=An\\sanonymous\\suser\\sis\\sgifting\\s5\\sTier\\s1\\sSubs\\sto\\sforsen's\\scommunity!;tmi-sent-ts=1794168001200;user-id=274598607;user-type= :tmi.twitch.tv USERNOTICE #forsen",
    raid: "@badge-info=;badges=turbo/1;color=#9ACD32;display-name=TestChannel;emotes=;id=3d830f12-795c-447d-af3c-ea05e40fbddb;login=testchannel;mod=0;msg-id=raid;msg-param-displayName=TestChannel;msg-param-login=testchannel;msg-param-viewerCount=15;room-id=22484632;subscriber=0;system-msg=15\\sraiders\\sfrom\\sTestChannel\\shave\\sjoined!;tmi-sent-ts=1794168001300;turbo=1;user-id=123456;user-type= :tmi.twitch.tv USERNOTICE #forsen",
    bitsBadgeTier:
        "@badges=;color=;display-name=Biter;emotes=;id=tier-1;login=biter;msg-id=bitsbadgetier;msg-param-threshold=10000;room-id=22484632;system-msg=bits\\sbadge\\stier\\snotification;tmi-sent-ts=1794168001400;user-id=46;user-type= :tmi.twitch.tv USERNOTICE #forsen :yay",
    sharedChatSub:
        "@badges=;color=;display-name=Other;emotes=;id=shared-1;login=other;msg-id=sharedchatnotice;source-msg-id=sub;room-id=22484632;source-room-id=999;system-msg=Other\\ssubscribed;tmi-sent-ts=1794168001500;user-id=47;user-type= :tmi.twitch.tv USERNOTICE #forsen",
    clearMsg:
        "@login=ronni;room-id=;target-msg-id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;tmi-sent-ts=1794168002000 :tmi.twitch.tv CLEARMSG #forsen :Kappa Keepo Kappa",
    ban: "@room-id=22484632;target-user-id=12345678;tmi-sent-ts=1794168002100 :tmi.twitch.tv CLEARCHAT #forsen :ronni",
    timeout600: "@ban-duration=600;room-id=22484632;target-user-id=12345678;tmi-sent-ts=1794168002200 :tmi.twitch.tv CLEARCHAT #forsen :ronni",
    clearChat: "@room-id=22484632;tmi-sent-ts=1794168002300 :tmi.twitch.tv CLEARCHAT #forsen",
    roomState: "@emote-only=0;followers-only=10;r9k=1;room-id=22484632;slow=30;subs-only=1 :tmi.twitch.tv ROOMSTATE #forsen",
    noticeTimedOut: "@msg-id=msg_timedout :tmi.twitch.tv NOTICE #forsen :You are timed out for 3600 more seconds.",
    noticeSlow:
        "@msg-id=msg_slowmode :tmi.twitch.tv NOTICE #forsen :This room is in slow mode and you are sending messages too quickly. You will be able to talk again in 10 seconds.",
    noticeLoginFailed: ":tmi.twitch.tv NOTICE * :Login authentication failed",
    noticeGeneric: "@msg-id=msg_duplicate :tmi.twitch.tv NOTICE #forsen :Your message was not sent because it is identical to the previous one you sent, less than 30 seconds ago.",
    welcome: ":tmi.twitch.tv 001 justinfan12345 :Welcome, GLHF!",
    ping: "PING :tmi.twitch.tv",
    reconnect: ":tmi.twitch.tv RECONNECT",
};
