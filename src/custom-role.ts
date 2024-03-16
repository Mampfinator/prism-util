import {
    ActionRowBuilder,
    ChatInputCommandInteraction,
    Client,
    Colors,
    EmbedBuilder,
    Events,
    GuildMember,
    ModalBuilder,
    SlashCommandBuilder,
    Snowflake,
    TextInputBuilder,
} from "discord.js";

export const CUSTOM_ROLE_NEED_BOOSTER = new EmbedBuilder()
    .setColor(Colors.Red)
    .setDescription(
        ":x: You need to be a [Server Booster](https://support.discord.com/hc/en-us/articles/360028038352-Server-Boosting-FAQ#h_01HGX7DJ331AJ25MPQRD6R83KJ) to use this feature.",
    );

export const CUSTOM_ROLE_NO_ROLE = new EmbedBuilder()
    .setColor(Colors.Red)
    .setDescription(":x: You don't have a custom role!");

export const CUSTOM_ROLE_COMMAND = {
    type: "SlashCommand" as const,
    builder: new SlashCommandBuilder()
        .setName("custom-role")
        .setDescription("Manage your Server Booster custom role.")
        .addSubcommand(edit =>
            edit
                .setName("edit")
                .setDescription("Edit your role. This can also be used to create your role."),
        )
        .addSubcommand(remove =>
            remove.setName("delete").setDescription("Delete your custom role."),
        ) as SlashCommandBuilder,
    init(client: Client) {
        client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
            const customRoles = newMember.client.customRoles;

            // member has stopped boosting
            if (!!oldMember.premiumSince && !newMember.premiumSince) {
                const roleId = await customRoles.get(`${newMember.guild.id}:${newMember.id}`);

                if (!roleId) return;

                await newMember.guild.roles.delete(roleId).catch(() => {});
                // delete custom role entry
                await customRoles.delete(`${newMember.guild.id}:${newMember.id}`);
            }
        });
    },
    execute: async (interaction: ChatInputCommandInteraction) => {
        const subcommand = interaction.options.getSubcommand(true) as "edit" | "remove" | "info";

        const isBoosting = !!(interaction.member! as GuildMember).premiumSince;

        if (!isBoosting) {
            return interaction.reply({
                embeds: [CUSTOM_ROLE_NEED_BOOSTER],
                ephemeral: true,
            });
        }

        const roleId: Snowflake | undefined = await interaction.client.customRoles
            .get(`${interaction.guildId}:${interaction.user.id}`)
            .catch(() => {});

        switch (subcommand) {
            case "remove": {
                if (!roleId) {
                    return interaction.reply({
                        embeds: [CUSTOM_ROLE_NO_ROLE],
                        ephemeral: true,
                    });
                }

                await interaction.guild!.roles.delete(roleId);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setDescription(":white_check_mark: Your role has been deleted."),
                    ],
                    ephemeral: true,
                });
            }

            case "edit": {
                let role = await interaction.guild!.roles.fetch(roleId!).catch(() => {});

                const roleNameInput = new TextInputBuilder()
                    .setCustomId("role-name")
                    .setRequired(true);

                const roleIconInput = new TextInputBuilder().setCustomId("role-icon");
                if (!!role) {
                    roleNameInput.setValue(role.name);
                    if (!!role.icon) roleIconInput.setValue(role.icon);
                }

                const modal = new ModalBuilder()
                    .setCustomId("edit-role")
                    .setTitle("Edit Custom Role")
                    .addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(roleNameInput),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(roleIconInput),
                    );

                await interaction.showModal(modal);

                const roleEdit = await interaction.awaitModalSubmit({
                    time: 1000 * 60 * 2,
                });

                await roleEdit.deferReply().catch(() => {});

                const roleName = roleEdit.fields.getTextInputValue("role-name");
                const roleIcon = roleEdit.fields.getField("role-icon").value;

                if (!role) {
                    await interaction.guild!.roles.create({
                        name: roleName,
                        icon: roleIcon,
                    });
                } else {
                    await role.edit({ name: roleName, icon: roleIcon });
                }
            }
        }
    },
};
