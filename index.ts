import { Telegraf, Context } from "telegraf"
import { join } from 'path'
import { Low, JSONFile } from 'lowdb'
import { formatDistance, parseISO } from "date-fns";
import { fi } from 'date-fns/locale'
import { Update, Message } from "typegram";



var _ = require('lodash');

const validChatId = (chatId) => {
    return true
    // return chatId === -416691354
}

type Data = {
    log: {
        userId: number,
        timestamp: Date,
        firstName: string,
    }[]
}

require('dotenv').config()


// Use JSON file for storage
const file = join(__dirname, 'db.json')
const adapter = new JSONFile<Data>(file)
const db = new Low(adapter);

(async function () {
    
    await db.read()
    db.data ||= { log: [] }
})()



// Define your own context type
interface MyContext extends Context {
    myProp?: string
    myOtherProp?: number
  }

const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN)

const cheersReply = async (ctx: Context<{ message: Update.New & Update.NonChannel & Message.TextMessage; update_id: number; }> & Omit<MyContext, keyof Context<Update>>) => {
    await db.read()
    const entries = db.data.log;

    
    const tonnis = entries.filter(i => i.userId === ctx.from.id).length
    return(`
    
    Se oli tonnin repäsy.
    
Hyvä homma ${ctx.message.from.first_name}! Taas voi pötcöttää pari viikkoa. Sinulla on nyt ${tonnis} tonnia kasassa
                `
)
}

const statsReply = async (ctx: Context<{ message: Update.New & Update.NonChannel & Message.TextMessage; update_id: number; }> & Omit<MyContext, keyof Context<Update>>) => {
    await db.read()
    const entries = (db.data ||= { log: [] }).log

    const groupedEntries = _
        .chain(entries)
        .groupBy("userId")
        .mapValues(entry => {return ({amount: entry.length, first_name: entry[entry.length-1].firstName, last: entry[entry.length-1].timestamp })})
        .values()
        .sortBy('amount')
        .reverse()
        .value()
    

    const retString:string[] = groupedEntries.map(entry => {
    
        
        const agoString = formatDistance(parseISO(entry.last), new Date(),{ addSuffix: true, locale: fi })
    
        return(`<b>${entry.first_name} - ${String(entry.amount)} tonnia</b>\nedellinen ${agoString}\n\n`)
    })

    

    return(`
Nonii, katellaas vähä paljo peli

${retString.join('')}

`)
}



bot.start((ctx) => ctx.reply('Se on raaka peli'))
bot.help((ctx) => ctx.reply('Apua ei tule'))
bot.on('text', async ctx => {

    console.log((await ctx.getChat()).id)

    if(
        !!ctx.message.text
    ){
        if (!validChatId((await ctx.getChat()).id)){
            ctx.reply('Kirjaa kaikki jutut chätin kautta')
        } else if(ctx.message.text.includes('/tonni')){
            db.data.log.push({
                userId: ctx.message.from.id,
                timestamp: new Date(),
                firstName: ctx.message.from.first_name
            })
            await db.write()
            ctx.reply(await cheersReply(ctx))
        }
        else if(ctx.message.text.includes('/stats')){
            ctx.replyWithHTML(await statsReply(ctx))
        }
    } 

    
    
})

bot.launch()

console.log('Ready')