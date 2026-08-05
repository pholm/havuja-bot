import type { Update, UserFromGetMe } from 'grammy/types';

export const CHAT_ID = -1001234567890;

export type TelegramUser = {
    id: number;
    is_bot: false;
    first_name: string;
    last_name?: string;
};

export const ALICE: TelegramUser = {
    id: 42,
    is_bot: false,
    first_name: 'Petrus',
    last_name: 'Holm',
};

/** Deliberately has no surname, so the null last_name path stays covered. */
export const BOB: TelegramUser = {
    id: 77,
    is_bot: false,
    first_name: 'Lehvi',
};

export const BOT_INFO: UserFromGetMe = {
    id: 1,
    is_bot: true,
    first_name: 'HavujaBot',
    username: 'havujabot',
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
};

export type RecordedCall = {
    method: string;
    payload: Record<string, unknown>;
};

/**
 * Stands in for the Telegram HTTP API. Records every outgoing call and answers
 * with a plausible result so grammY can carry on.
 *
 * Returned as a `fetch` implementation rather than an api transformer because
 * the conversations plugin builds its own API client from the bot's client
 * options — a transformer installed on `bot.api` would not reach the wizards.
 */
export class FakeTelegram {
    readonly calls: RecordedCall[] = [];
    private messageIdSeq = 1000;

    /** Every call recorded since the given mark. */
    since(mark: number): RecordedCall[] {
        return this.calls.slice(mark);
    }

    /** A mark to pass to `since`, so a test can look at one step in isolation. */
    mark(): number {
        return this.calls.length;
    }

    /** Text of every `sendMessage` since the given mark. */
    textsSince(mark: number): string[] {
        return this.since(mark)
            .filter((call) => call.method === 'sendMessage')
            .map((call) => String(call.payload.text));
    }

    /** Names of every method called since the given mark. */
    methodsSince(mark: number): string[] {
        return this.since(mark).map((call) => call.method);
    }

    nextMessageId(): number {
        return ++this.messageIdSeq;
    }

    readonly fetch = async (
        url: string | { url?: string },
        options: {
            body?: unknown;
            signal?: AbortSignal;
        } = {},
    ) => {
        const href = typeof url === 'string' ? url : (url.url ?? String(url));
        const match = href.match(/\/bot[^/]+\/([A-Za-z]+)/);
        if (match === null) {
            throw new Error(`unexpected request to ${href}`);
        }
        const method = match[1];

        // Park long polling until the caller aborts, so a bot that was started
        // by accident cannot spin.
        if (method === 'getUpdates') {
            return await new Promise((resolve) => {
                const done = () =>
                    resolve(jsonResponse({ ok: true, result: [] }));
                if (options.signal?.aborted) return done();
                options.signal?.addEventListener('abort', done, { once: true });
            });
        }

        const payload = readPayload(options.body);
        this.calls.push({ method, payload });

        return jsonResponse({
            ok: true,
            result: this.resultFor(method, payload),
        });
    };

    private resultFor(method: string, payload: Record<string, unknown>) {
        const chat = {
            id: Number(payload.chat_id ?? CHAT_ID),
            type: 'supergroup' as const,
            title: 'hiihtorinki',
        };

        switch (method) {
            case 'getMe':
                return BOT_INFO;
            case 'sendMessage':
                return {
                    message_id: this.nextMessageId(),
                    date: 0,
                    chat,
                    text: payload.text,
                };
            case 'sendPhoto':
                return {
                    message_id: this.nextMessageId(),
                    date: 0,
                    chat,
                    photo: [
                        {
                            file_id: 'file',
                            file_unique_id: 'unique',
                            width: 1,
                            height: 1,
                        },
                    ],
                    caption: payload.caption,
                };
            default:
                return true;
        }
    }
}

const jsonResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
});

const readPayload = (body: unknown): Record<string, unknown> => {
    if (typeof body === 'string') {
        try {
            return JSON.parse(body) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    // Multipart bodies carry an InputFile; record the fact rather than the bytes.
    if (body !== null && typeof body === 'object') {
        return { multipart: true };
    }
    return {};
};

let updateIdSeq = 5000;

export const textUpdate = (
    text: string,
    from: TelegramUser = ALICE,
    entities?: { type: string; offset: number; length: number }[],
): Update =>
    ({
        update_id: ++updateIdSeq,
        message: {
            message_id: ++updateIdSeq,
            date: Math.floor(Date.now() / 1000),
            chat: { id: CHAT_ID, type: 'supergroup', title: 'hiihtorinki' },
            from,
            text,
            ...(entities ? { entities } : {}),
        },
    }) as Update;

export const commandUpdate = (
    command: string,
    from: TelegramUser = ALICE,
): Update =>
    textUpdate(`/${command}`, from, [
        { type: 'bot_command', offset: 0, length: command.length + 1 },
    ]);

/** A message with no text at all, e.g. a sticker. */
export const stickerUpdate = (from: TelegramUser = ALICE): Update =>
    ({
        update_id: ++updateIdSeq,
        message: {
            message_id: ++updateIdSeq,
            date: Math.floor(Date.now() / 1000),
            chat: { id: CHAT_ID, type: 'supergroup', title: 'hiihtorinki' },
            from,
            sticker: {
                file_id: 'sticker',
                file_unique_id: 'sticker-unique',
                type: 'regular',
                width: 1,
                height: 1,
                is_animated: false,
                is_video: false,
            },
        },
    }) as Update;
