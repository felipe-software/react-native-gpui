import { describe, expect, test } from "bun:test";
import { accountFromCredentials, credentialErrors, parseLoginInfo } from "../accounts";
import { assetPath } from "../assets";
import { buildNicknameMatcher, stylizeName } from "../filters/nicknames";
import { duplicateTriggers, expandCustomCommand, runCustomCommands, type CommandVariables } from "../twitch/custom-commands";
import { moderationLink, parseModerationAction, parseModerationLink } from "../twitch/moderation-actions";

const VARS: CommandVariables = { channelName: "forsen", channelId: "22484632", isTwitchChannel: true, myName: "mylogin", myId: "999" };

describe("login info", () => {
    test("parses the pasted login string like LoginDialog", () => {
        const pasted = "oauth_token=abc123;client_id=cid;username=MyLogin;user_id=999";
        expect(parseLoginInfo(pasted)).toEqual({ oauthToken: "abc123", clientId: "cid", username: "MyLogin", userId: "999" });
    });

    test("skips unknown keys and parts that do not split into exactly two", () => {
        const pasted = "username=a;user_id=1;bogus=x;client_id=c=d;oauth_token;oauth_token=t";
        expect(parseLoginInfo(pasted)).toEqual({ username: "a", userId: "1", clientId: "", oauthToken: "t" });
    });

    test("reports missing fields in Chatterino's order", () => {
        expect(credentialErrors(parseLoginInfo(""))).toEqual(["Missing user ID", "Missing username", "Missing Client ID", "Missing OAuth Token"]);
        expect(credentialErrors(parseLoginInfo("username=a;user_id=1;client_id=c"))).toEqual(["Missing OAuth Token"]);
    });

    test("builds an account with a lowercase login and no oauth: prefix", () => {
        const account = accountFromCredentials({ username: " MyLogin ", userId: "999", clientId: "cid", oauthToken: "oauth:tok" }, ["chat:read"]);
        expect(account).toEqual({ login: "mylogin", userId: "999", clientId: "cid", token: "tok", scopes: ["chat:read"] });
    });
});

describe("custom commands", () => {
    const words = ["/hug", "alice", "bob", "carol"];

    test("expands word indexes and ranges", () => {
        expect(expandCustomCommand("/me hugs {1} and {2+}", words, VARS)).toBe("/me hugs alice and bob carol");
        expect(expandCustomCommand("{1}{2}", words, VARS)).toBe("alicebob");
        expect(expandCustomCommand("missing:{9}.", words, VARS)).toBe("missing:.");
    });

    test("expands variables, alternatives and unknown names", () => {
        expect(expandCustomCommand("{channel.name} {channel.id} {my.name}", words, VARS)).toBe("forsen 22484632 mylogin");
        expect(expandCustomCommand("{user.name;nobody}", words, VARS)).toBe("nobody");
        expect(expandCustomCommand("{stream.title;offline}", words, VARS)).toBe("offline");
        expect(expandCustomCommand("{nope}", words, VARS)).toBe("{nope}");
        const message = { login: "pinger", id: "m-1", text: "hello there" };
        expect(expandCustomCommand("/reply {msg.id} {user.name}: {msg.text}", words, { ...VARS, message })).toBe("/reply m-1 pinger: hello there");
    });

    test("context values win over built-in variables and fall back to the alternative when empty", () => {
        const context = { "channel.name": "override", "input.text": "" };
        expect(expandCustomCommand("{channel.name} {input.text;empty}", words, { ...VARS, context })).toBe("override empty");
    });

    test("doubled braces collapse to a literal brace", () => {
        expect(expandCustomCommand("a {{b", words, VARS)).toBe("a {b");
    });

    test("finds single and multi-word triggers", () => {
        const commands = [
            { trigger: "/hug", command: "/me hugs {1}", showInMessageMenu: false },
            { trigger: "/say hi", command: "hello {2+}", showInMessageMenu: false },
            { trigger: "/hug", command: "duplicate", showInMessageMenu: false },
        ];
        expect(runCustomCommands("/hug alice", commands, VARS)).toEqual({ kind: "builtin", text: "/me hugs alice" });
        expect(runCustomCommands("/say hi everyone here", commands, VARS)).toEqual({ kind: "raw", text: "hello everyone here" });
        expect(runCustomCommands("plain text", commands, VARS)).toEqual({ kind: "none" });
        expect([...duplicateTriggers(commands)]).toEqual(["/hug"]);
    });
});

describe("moderation buttons", () => {
    test("timeouts show the duration on two lines", () => {
        expect(parseModerationAction({ action: "/timeout {user.name} 600" })).toEqual({ kind: "text", line1: "10", line2: "m" });
        expect(parseModerationAction({ action: "/timeout {user.name} 300s" })).toEqual({ kind: "text", line1: "5", line2: "m" });
        expect(parseModerationAction({ action: "/timeout {user.name} 1d" })).toEqual({ kind: "text", line1: "1", line2: "d" });
        expect(parseModerationAction({ action: "/timeout {user.name} 2w" })).toEqual({ kind: "text", line1: "2", line2: "w" });
        expect(parseModerationAction({ action: "/timeout {user.name} 3w" })).toEqual({ kind: "text", line1: ">2", line2: "w" });
    });

    test("ban and delete use Chatterino's icons, custom icons and other commands use their text", () => {
        expect(parseModerationAction({ action: "/ban {user.name}" })).toMatchObject({ kind: "image", url: assetPath("buttons/ban.png") });
        expect(parseModerationAction({ action: "/delete {msg.id}" })).toMatchObject({ kind: "image", url: assetPath("buttons/trashCan.png") });
        expect(parseModerationAction({ action: "/vip {user.name}", iconPath: "file:///tmp/vip.png" })).toMatchObject({ kind: "image", url: "/tmp/vip.png" });
        expect(parseModerationAction({ action: "!so {user.name}" })).toEqual({ kind: "text", line1: "so", line2: " {" });
    });

    test("links round-trip message ids", () => {
        const link = moderationLink(3, "a/b c");
        expect(parseModerationLink(link)).toEqual({ index: 3, messageId: "a/b c" });
        expect(parseModerationLink("https://example.com")).toBeUndefined();
    });
});

describe("nicknames", () => {
    test("plain entries replace the whole name, regex entries replace matches with backreferences", () => {
        const matcher = buildNicknameMatcher([
            { name: "Forsen", replace: "Big Forsen", isRegex: false, caseSensitive: false },
            { name: "^x(\\w+)$", replace: "\\1 (x)", isRegex: true, caseSensitive: false },
            { name: "Exact", replace: "never", isRegex: false, caseSensitive: true },
        ]);
        expect(matcher("forsen")).toBe("Big Forsen");
        expect(matcher("Xqc")).toBe("qc (x)");
        expect(matcher("exact")).toBeUndefined();
        expect(stylizeName("forsen", undefined, "username", matcher)).toBe("Big Forsen");
        expect(stylizeName("user", "ユーザー", "usernameAndLocalizedName", matcher)).toBe("user(ユーザー)");
    });

    test("a dollar sign in the replacement is literal", () => {
        const matcher = buildNicknameMatcher([{ name: "(cash)", replace: "$1 \\1", isRegex: true, caseSensitive: false }]);
        expect(matcher("cash")).toBe("$1 cash");
    });
});
