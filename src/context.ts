import type { Context } from 'grammy';
import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';

/** Context for middleware running outside a conversation. */
export type BotContext = ConversationFlavor<Context>;

/**
 * Context for code running inside a conversation. Conversations cannot be
 * nested, so this deliberately lacks `ctx.conversation`.
 */
export type ConversationContext = Context;

export type BotConversation = Conversation<BotContext, ConversationContext>;
