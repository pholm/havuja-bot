import { BotContext } from '.';
import { Scenes } from 'telegraf';
import db = require('./db');

interface MyWizardContext extends Scenes.WizardContext {
    wizard: any;
}

const cheersReply = async (ctx: BotContext, kmRounded: number) => {
    const stats = await db.getStatsForUser(ctx.from.id);
    return `
    Lisäsin sinulle ${kmRounded} kilometriä.
    
Hyvä homma ${
        ctx.message.from.first_name
    }! Sinulla on nyt ${stats.amount.toFixed(2)} kilometriä kasassa.
                `;
};

let replyMessageId: number;

export const skiRecordWizard = new Scenes.WizardScene<MyWizardContext>(
    'SKIED_RECORD_WIZARD',
    async (ctx) => {
        const reply = await ctx.reply('Ok, laitappas vielä ne kilometrit', {
            reply_markup: {
                input_field_placeholder: '12.3',
                force_reply: true,
                one_time_keyboard: true,
            },
        });

        replyMessageId = reply.message_id;
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!('text' in ctx.message)) {
            ctx.reply('Vastaa nyt järkevästi');
            return ctx.scene.reenter();
        }

        const kilometers = parseFloat(ctx.message.text.replace(',', '.'));
        const kmRounded = Math.round(kilometers * 100) / 100;

        if (isNaN(kmRounded)) {
            ctx.reply('Syötä kilometrit muodossa 100,0 tai 100.0', {
                reply_markup: {
                    remove_keyboard: true,
                },
            });
            return ctx.scene.reenter();
        } else {
            const result = await db.writeRecordToDb(
                ctx.message.from.id,
                ctx.message.from.first_name,
                ctx.message.from.last_name,
                new Date(),
                kmRounded,
            );

            if (result.success) {
                await ctx.reply(await cheersReply(ctx, kmRounded), {
                    reply_markup: {
                        remove_keyboard: true,
                    },
                });

                await new Promise((resolve) => setTimeout(resolve, 1000));

                await ctx.deleteMessage(replyMessageId);
                await ctx.deleteMessage(ctx.message.message_id);
            } else {
                ctx.reply('Jokin meni pieleen, yritä uudelleen.');
                return ctx.scene.reenter();
            }
        }
        return ctx.scene.leave();
    },
);

export const betWizard = new Scenes.WizardScene<MyWizardContext>(
    'BET_WIZARD',
    (ctx) => {
        ctx.reply('Paljon pistetään?', {
            reply_markup: {
                input_field_placeholder: '750',
                force_reply: true,
            },
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!('text' in ctx.message)) {
            ctx.reply('Bettaas nyt järkevästi');
            return ctx.scene.reenter();
        }

        const bet = parseFloat(ctx.message.text);
        if (isNaN(bet)) {
            ctx.reply('Syötä betti muodossa 100 (ilman desimaaleja)', {
                reply_markup: {
                    remove_keyboard: true,
                },
            });
            return ctx.scene.reenter();
        } else {
            const currentBet = await db.getBet(ctx.message.from.id);
            if (currentBet && currentBet > bet) {
                ctx.reply(`Et voi betata vähemmän kuin ${currentBet} 😡`, {
                    reply_markup: {
                        remove_keyboard: true,
                    },
                });
                return ctx.scene.reenter();
            }

            const result = await db.setBet(
                ctx.message.from.id,
                ctx.message.from.first_name,
                ctx.message.from.last_name,
                bet,
            );
            if (result.success) {
                await ctx.replyWithPhoto(
                    { source: 'heinis.jpg' },
                    {
                        caption: `💥 Erinomainen betti ${ctx.message.from.first_name}! 💥`,
                    },
                );
            } else {
                ctx.reply('Jokin meni pieleen, yritä uudelleen.');
                return ctx.scene.reenter();
            }
        }
        return ctx.scene.leave();
    },
);

export const nicknameWizard = new Scenes.WizardScene<MyWizardContext>(
    'NICKNAME_WIZARD',
    (ctx) => {
        ctx.reply('Anna uusi lempinimi', {
            reply_markup: {
                input_field_placeholder: 'Hessu',
                force_reply: true,
            },
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!('text' in ctx.message)) {
            ctx.reply('Vastaa nyt järkevästi');
            return ctx.scene.reenter();
        }

        const nickname = ctx.message.text;
        const result = await db.setNickname(ctx.message.from.id, nickname);

        if (result.success) {
            ctx.reply(`Lempinimesi on nyt ${nickname}`, {
                reply_markup: {
                    remove_keyboard: true,
                },
            });
        } else {
            ctx.reply('Jokin meni pieleen, yritä uudelleen.');
            return ctx.scene.reenter();
        }
        return ctx.scene.leave();
    },
);
