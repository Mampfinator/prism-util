import {
    ChatInputCommandInteraction,
    Client,
    CommandInteraction,
    ContextMenuCommandBuilder,
    MessageContextMenuCommandInteraction,
    SlashCommandBuilder,
    UserContextMenuCommandInteraction,
} from "discord.js";

export enum CommandType {
    SlashCommand = "SlashCommand",
    MessageContextMenuCommand = "MessageContextMenuCommand",
    UserContextMenuCommand = "UserContextMenuCommand",
}

// lookup table
type BuilderTypes = {
    [CommandType.SlashCommand]: SlashCommandBuilder;
    [CommandType.MessageContextMenuCommand]: ContextMenuCommandBuilder;
    [CommandType.UserContextMenuCommand]: ContextMenuCommandBuilder;
};

type CommandInteractionTypes = {
    [CommandType.SlashCommand]: ChatInputCommandInteraction;
    [CommandType.MessageContextMenuCommand]: MessageContextMenuCommandInteraction;
    [CommandType.UserContextMenuCommand]: UserContextMenuCommandInteraction;
};

export interface Command<T extends CommandType> {
    type: T;
    builder: BuilderTypes[T];
    execute(interaction: CommandInteractionTypes[T]): Promise<any>;
    init?(client: Client): any;
}

export class CommandLoader {
    readonly slashCommands: Command<CommandType.SlashCommand>[] = [];
    readonly messageContextMenuCommands: Command<CommandType.MessageContextMenuCommand>[] =
        [];
    readonly userContextMenuCommands: Command<CommandType.UserContextMenuCommand>[] =
        [];

    constructor(public readonly client: Client) {}

    public addCommand<T extends CommandType>(command: Command<T>) {
        // TS isn't able to infer T here for some reason, so we have to cast.
        switch (command.type) {
            case CommandType.SlashCommand:
                this.slashCommands.push(
                    command as Command<CommandType.SlashCommand>,
                );
                break;
            case CommandType.MessageContextMenuCommand:
                this.messageContextMenuCommands.push(
                    command as Command<CommandType.MessageContextMenuCommand>,
                );
                break;
            case CommandType.UserContextMenuCommand:
                this.userContextMenuCommands.push(
                    command as Command<CommandType.UserContextMenuCommand>,
                );
                break;
        }
    }

    public async handleInteraction(interaction: CommandInteraction) {
        console.log(`Executing command "${interaction.commandName}".`);

        let handler: Command<any>["execute"] | undefined;

        if (interaction.isChatInputCommand()) {
            handler = this.slashCommands.find(
                c => c.builder.name == interaction.commandName,
            )?.execute;
        }

        if (interaction.isMessageContextMenuCommand()) {
            handler = this.messageContextMenuCommands.find(
                c => c.builder.name == interaction.commandName,
            )?.execute;
        }

        if (interaction.isUserContextMenuCommand()) {
            handler = this.userContextMenuCommands.find(
                c => c.builder.name == interaction.commandName,
            )?.execute;
        }

        if (!!handler) {
            await handler(interaction).catch(error => {
                console.log(
                    `Error executing command ${interaction.commandName}: `,
                    error,
                );
            });
            console.log(`Executed command "${interaction.commandName}".`);
        } else {
            console.warn(`No such command: ${interaction.commandName}.`);
        }
    }

    public async init() {
        for (const command of [
            ...this.slashCommands,
            ...this.messageContextMenuCommands,
            ...this.userContextMenuCommands,
        ]) {
            if (command.init) {
                await command.init(this.client);
            }
        }
    }

    public async register(debugGuildId?: string) {
        for (const command of [
            ...this.slashCommands,
            ...this.messageContextMenuCommands,
            ...this.userContextMenuCommands,
        ]) {
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
