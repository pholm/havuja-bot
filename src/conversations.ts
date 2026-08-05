import { InputFile } from 'grammy';

import type { BotConversation, ConversationContext } from './context.ts';
import * as db from './db/index.ts';

export const SKI_RECORD_CONVERSATION = 'skiRecord';
export const BET_CONVERSATION = 'bet';
export const NICKNAME_CONVERSATION = 'nickname';

/**
 * Every database call has to go through `conversation.external` — a
 * conversation body is replayed from the top on each incoming update, and only
 * external results are cached instead of being run again.
 */
const cheersReply = async (
    conversation: BotConversation,
    userId: number,
    fallbackName: string,
    kmRounded: number,
) => {
    const nickname = await conversation.external(() => db.getNickname(userId));
    const stats = await conversation.external(() => db.getStatsForUser(userId));
    const total = stats
        ? ` Sinulla on nyt ${stats.amount.toFixed(2)} kilometriä kasassa.`
        : '';

    return `
    Lisäsin sinulle ${kmRounded} kilometriä.

Hyvä homma ${nickname || fallbackName}!${total}
                `;
};

const deleteMessagesSafely = async (
    ctx: ConversationContext,
    messageIds: number[],
) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
        return;
    }

    for (const messageId of messageIds) {
        try {
            await ctx.api.deleteMessage(chatId, messageId);
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
};

export async function skiRecordConversation(
    conversation: BotConversation,
    ctx: ConversationContext,
) {
    let current = ctx;
    const messagesToDelete: number[] = [];
    let replyToMessageId = ctx.message?.message_id;

    if (replyToMessageId !== undefined) {
        messagesToDelete.push(replyToMessageId);
    }

    // The loop replaces the old wizard's "jump back to step one" retry.
    for (;;) {
        const prompt = await current.reply(
            'Ok, laitappas vielä ne kilometrit',
            {
                reply_markup: {
                    input_field_placeholder: '12.3',
                    force_reply: true,
                    selective: true,
                    one_time_keyboard: true,
                },
                reply_parameters:
                    replyToMessageId === undefined
                        ? undefined
                        : { message_id: replyToMessageId },
            },
        );
        messagesToDelete.push(prompt.message_id);

        current = await conversation.wait();
        const answer = current.message;

        if (answer !== undefined) {
            messagesToDelete.push(answer.message_id);
            replyToMessageId = answer.message_id;
        }

        if (answer?.text === undefined) {
            const reply = await current.reply('Vastaa nyt järkevästi');
            messagesToDelete.push(reply.message_id);
            continue;
        }

        const kilometers = parseFloat(answer.text.replace(',', '.'));
        const kmRounded = Math.round(kilometers * 100) / 100;

        if (isNaN(kmRounded)) {
            const reply = await current.reply(
                'Syötä kilometrit muodossa 100,0 tai 100.0',
            );
            messagesToDelete.push(reply.message_id);
            continue;
        }

        const from = answer.from;
        if (from === undefined) {
            return;
        }

        const result = await conversation.external(() =>
            db.writeRecordToDb(
                from.id,
                from.first_name,
                from.last_name ?? null,
                new Date(),
                kmRounded,
            ),
        );

        if (!result.success) {
            const reply = await current.reply(
                'Jokin meni pieleen, yritä uudelleen.',
            );
            messagesToDelete.push(reply.message_id);
            continue;
        }

        await current.reply(
            await cheersReply(
                conversation,
                from.id,
                from.first_name,
                kmRounded,
            ),
            { reply_markup: { remove_keyboard: true } },
        );

        // Leave the confirmation up for a moment before tidying the thread.
        await conversation.external(
            () => new Promise((resolve) => setTimeout(resolve, 2000)),
        );

        await deleteMessagesSafely(current, messagesToDelete);
        return;
    }
}

export async function betConversation(
    conversation: BotConversation,
    ctx: ConversationContext,
) {
    let current = ctx;

    for (;;) {
        const replyToMessageId = current.message?.message_id;

        await current.reply('Paljon pistetään?', {
            reply_markup: {
                input_field_placeholder: '750',
                force_reply: true,
                selective: true,
            },
            reply_parameters:
                replyToMessageId === undefined
                    ? undefined
                    : { message_id: replyToMessageId },
        });

        current = await conversation.wait();
        const answer = current.message;

        if (answer?.text === undefined) {
            await current.reply('Bettaas nyt järkevästi');
            continue;
        }

        const bet = parseFloat(answer.text);

        if (isNaN(bet)) {
            await current.reply(
                'Syötä betti muodossa 100 (ilman desimaaleja)',
                {
                    reply_markup: { remove_keyboard: true },
                },
            );
            continue;
        }

        const from = answer.from;
        if (from === undefined) {
            return;
        }

        const currentBet = await conversation.external(() =>
            db.getBet(from.id),
        );
        if (currentBet && currentBet > bet) {
            await current.reply(
                `Et voi betata vähemmän kuin ${currentBet} 😡`,
                {
                    reply_markup: { remove_keyboard: true },
                },
            );
            continue;
        }

        const result = await conversation.external(() =>
            db.setBet(from.id, from.first_name, from.last_name ?? null, bet),
        );

        if (!result.success) {
            await current.reply('Jokin meni pieleen, yritä uudelleen.');
            continue;
        }

        const nickname = await conversation.external(() =>
            db.getNickname(from.id),
        );
        await current.replyWithPhoto(new InputFile('heinis.jpg'), {
            caption: `💥 Erinomainen betti ${nickname || from.first_name}! 💥`,
        });
        return;
    }
}

export async function nicknameConversation(
    conversation: BotConversation,
    ctx: ConversationContext,
) {
    let current = ctx;

    for (;;) {
        const replyToMessageId = current.message?.message_id;

        await current.reply('Anna uusi lempinimi', {
            reply_markup: {
                input_field_placeholder: 'Hessu',
                force_reply: true,
                selective: true,
            },
            reply_parameters:
                replyToMessageId === undefined
                    ? undefined
                    : { message_id: replyToMessageId },
        });

        current = await conversation.wait();
        const answer = current.message;

        if (answer?.text === undefined) {
            await current.reply('Vastaa nyt järkevästi');
            continue;
        }

        const from = answer.from;
        if (from === undefined) {
            return;
        }

        const nickname = answer.text;
        const result = await conversation.external(() =>
            db.setNickname(from.id, nickname),
        );

        if (!result.success) {
            await current.reply('Jokin meni pieleen, yritä uudelleen.');
            continue;
        }

        await current.reply(`Lempinimesi on nyt ${nickname}`, {
            reply_markup: { remove_keyboard: true },
        });
        return;
    }
}
