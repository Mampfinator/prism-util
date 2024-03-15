import {
    ChatInputCommandInteraction,
    Client,
    CommandInteraction,
    ContextMenuCommandBuilder,
    MessageContextMenuCommandInteraction,
    SlashCommandBuilder,
    UserContextMenuCommandInteraction,
} from "discord.js";

export const COMMAND_TYPES = [
    "SlashCommand",
    "MessageContextMenuCommand",
    "UserContextMenuCommand",
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

// lookup table
type BuilderTypes = {
    SlashCommand: SlashCommandBuilder;
    MessageContextMenuCommand: ContextMenuCommandBuilder;
    UserContextMenuCommand: ContextMenuCommandBuilder;
};

type CommandInteractionTypes = {
    SlashCommand: ChatInputCommandInteraction;
    MessageContextMenuCommand: MessageContextMenuCommandInteraction;
    UserContextMenuCommand: UserContextMenuCommandInteraction;
};

export interface Command<T extends CommandType> {
    type: T;
    builder: BuilderTypes[T];
    execute(interaction: CommandInteractionTypes[T]): Promise<any>;
    init?(client: Client): any;
}

type CommandRecord = { [T in CommandType]: Command<T>[] };

export class CommandLoader {
    private readonly commands: CommandRecord;

    constructor(public readonly client: Client) {
        // TypeScript has trouble reasoning about this.
        // This assertion *should* be valid.
        this.commands = Object.fromEntries(
            COMMAND_TYPES.map(type => [type, []]),
        ) as any as CommandRecord;
    }

    public addCommand<T extends CommandType>(command: Command<T>) {
        this.commands[command.type].push(command);
    }

    getType(interaction: CommandInteraction): CommandType | undefined {
        if (interaction.isChatInputCommand()) {
            return "SlashCommand";
        } else if (interaction.isMessageContextMenuCommand()) {
            return "MessageContextMenuCommand";
        } else if (interaction.isUserContextMenuCommand()) {
            return "UserContextMenuCommand";
        }
    }

    iterCommands(): Command<CommandType>[] {
        return COMMAND_TYPES.map(type => this.commands[type]).flat();
    }

    public async handleInteraction(interaction: CommandInteraction) {
        console.log(`Executing command "${interaction.commandName}".`);

        const type = this.getType(interaction);

        if (!type) {
            return;
        }

        const command = this.commands[type].find(
            c => c.builder.name == interaction.commandName,
        );

        if (!command) {
            console.log(`${type} "${interaction.commandName}" not found.`);
            return;
        }

        await command.execute(interaction as any);
    }

    public async init() {
        for (const command of this.iterCommands()) {
            if (command.init) {
                await command.init(this.client);
            }
        }
    }

    public async register(debugGuildId?: string) {
        for (const command of this.iterCommands()) {
            console.log(
                `Registering command "${command.builder.name}" of type "${command.type}".`,
            );

            await this.client.application!.commands.create(
                command.builder,
                debugGuildId,
            );
        }
    }

    public async cleanup() {
        const knownCommands = await this.client.application!.commands.fetch();
        console.log(`Deleting ${knownCommands.size} old commands.`);

        for (const [id, command] of knownCommands.entries()) {
            await this.client.application!.commands.delete(id);
            console.log(`Deleting old command "${command.name}"`);
        }
    }
}
