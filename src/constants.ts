import {
    ApplicationCommandType,
    Colors,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    PermissionsBitField,
    SlashCommandBuilder,
} from "discord.js";

export const INTERNAL_ERROR = new EmbedBuilder()
    .setDescription(":x: Internal error!")
    .setColor(Colors.Red);
export const MISSING_PERMISSIONS = new EmbedBuilder()
    .setDescription(":x: I don't have the permissions to do that here!")
    .setColor(Colors.Red);

export const NOT_CONFIGURED = new EmbedBuilder()
    .setDescription(":x: I'm not configured yet!")
    .setColor(Colors.Red);

export const PIN_REQUEST_ALREADY_PINNED = new EmbedBuilder()
    .setDescription(":x: This message is already pinned, silly!")
    .setColor(Colors.Red);

export const PIN_REQUEST_DO_IT_YOURSELF = new EmbedBuilder()
    .setDescription(":x: Just pin it yourself, stoobid.")
    .setColor(Colors.Red);

export const PIN_REQUESTED = new EmbedBuilder()
    .setDescription(
        ":white_check_mark: Your request has been sent to the mods! Please be patient while they have a look. :coffee:",
    )
    .setColor(Colors.Green);

export const PIN_REQUEST_CANCELLED = new EmbedBuilder()
    .setDescription(":x: Your pin request was cancelled!")
    .setColor(Colors.Red);

export const PIN_REQUEST_APPROVED_FEEDBACK = new EmbedBuilder()
    .setDescription(":white_check_mark: Your pin request has been approved!")
    .setColor(Colors.Green);
export const PIN_REQUEST_APPROVED_MOD = new EmbedBuilder()
    .setDescription(":white_check_mark: Pin approved!")
    .setColor(Colors.Green);

export function makeRequestDeniedFeedback(reason?: string): EmbedBuilder {
    if (reason && reason.length > 0) {
        return new EmbedBuilder(
            structuredClone(PIN_REQUEST_DENIED_FEEDBACK.data),
        ).addFields({
            name: "Reason",
            value: reason,
        });
    } else {
        return PIN_REQUEST_DENIED_FEEDBACK;
    }
}

export const PIN_REQUEST_DENIED_FEEDBACK = new EmbedBuilder()
    .setDescription(":x: Your pin request has been denied!")
    .setColor(Colors.Red);
export const PIN_REQUEST_DENIED_MOD = new EmbedBuilder()
    .setDescription(":x: Pin denied!")
    .setColor(Colors.Red);

export const CUSTOM_ROLE_COMMAND = new SlashCommandBuilder()
    .setDMPermission(false)
    .setName("custom-role")
    .setDescription("Manage your Server Booster custom role.")
    .addSubcommand(edit =>
        edit
            .setName("edit")
            .setDescription(
                "Edit your role. This can also be used to create your role.",
            ),
    )
    .addSubcommand(remove =>
        remove.setName("delete").setDescription("Delete your custom role."),
    );

export const CUSTOM_ROLE_NEED_BOOSTER = new EmbedBuilder()
    .setColor(Colors.Red)
    .setDescription(
        ":x: You need to be a [Server Booster](https://support.discord.com/hc/en-us/articles/360028038352-Server-Boosting-FAQ#h_01HGX7DJ331AJ25MPQRD6R83KJ) to use this feature.",
    );

export const CUSTOM_ROLE_NO_ROLE = new EmbedBuilder()
    .setColor(Colors.Red)
    .setDescription(":x: You don't have a custom role!");

// TODO: set of admin-only commands; one of which to import Copa roles
// actual code would look something like
/*
for every role between the anchor and the cutoff:
  if role.members.length != 1:
    continue; // probably not a target role
  
  member = role.members.first();
  if !member.is_boosting()
    continue; // there's something fishy, possibly warn somewhere
  
  custom_roles.insert(member.id, role.id)
*/
