import { Client, ClientOptions as DjsClientOptions, Events, IntentsBitField } from "discord.js";
import "dotenv/config";
import Keyv from "keyv";
import { CommandLoader } from "./command-loader";
import { CONFIG_COMMAND } from "./config";
import { REQUEST_PIN_COMMAND } from "./request-pin";
import { CUSTOM_ROLE_COMMAND } from "./custom-role";
import { IgnoreChannels, LOGGING_COMMAND } from "./logging";

const DB_PATH = process.env.DB_PATH ?? `sqlite://${process.cwd()}/db.sqlite`;

interface CustomClientOptions extends DjsClientOptions {
    dbPath: string;
}

declare module "discord.js" {
    interface Client {
        readonly commandLoader: CommandLoader;
        readonly requestChannels: Keyv;
        readonly customRoles: Keyv;
        readonly logChannels: Keyv;
        /**
         * Channels that should be ignored from logging.
         */
        readonly ignoredChannels: IgnoreChannels;
    }
}

interface ObjectConstructor {
    /**
     * Groups members of an iterable according to the return value of the passed callback.
     * @param items An iterable.
     * @param keySelector A callback which will be invoked for each item in items.
     */
    groupBy<K extends PropertyKey, T>(
        items: Iterable<T>,
        keySelector: (item: T, index: number) => K,
    ): Partial<Record<K, T[]>>;
}
function makeClient(options: CustomClientOptions): Client {
    const client = new Client(options);

    //@ts-ignore
    client.commandLoader = new CommandLoader(client);
    //@ts-ignore
    client.requestChannels = new Keyv(options.dbPath, {
        namespace: "request-channel",
    });
    //@ts-ignore
    client.customRoles = new Keyv(options.dbPath, {
        namespace: "custom-role",
    });
    //@ts-ignore
    client.logChannels = new Keyv(options.dbPath, {
        namespace: "log-channel",
    });
    // @ts-ignore
    client.ignoredChannels = new IgnoreChannels(options.dbPath);

    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isCommand()) return;
        try {
            await client.commandLoader.handleInteraction(interaction);
        } catch (err) {
            console.error(err);
            // TODO: user-facing error reporting.
        }
    });

    return client;
}

const client = makeClient({
    dbPath: DB_PATH,
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMessages,
    ],
});

client.on(Events.ClientReady, async () => {
    client.commandLoader.addCommand(CONFIG_COMMAND);
    client.commandLoader.addCommand(REQUEST_PIN_COMMAND);
    client.commandLoader.addCommand(CUSTOM_ROLE_COMMAND);
    client.commandLoader.addCommand(LOGGING_COMMAND);

    await client.commandLoader.init();

    console.log(`Logged in as ${client.user!.tag}!`);

    console.log("Cleaning up old commands...");
    await client.commandLoader.cleanup();

    const deployInGuild = process.env.DEBUG_GUILD_ID;

    console.log("Registering commands...");
    await client.commandLoader.register(deployInGuild);

    console.log("Done!");
});

client.login(process.env.DISCORD_TOKEN);
