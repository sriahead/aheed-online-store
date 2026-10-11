/**
 * The `/staff/assistant` switch form's state (#1015). Lives here, not in
 * `features/admin/assistant.ts`, because a `"use server"` file may export only async functions —
 * one exported constant there would 500 every action in it at runtime (#159).
 */

export const ASSISTANT_ENABLED_FIELD = "assistantEnabled";

export interface AssistantSettingsFormState {
  error: string | null;
  saved: boolean;
}

export const initialAssistantSettingsState: AssistantSettingsFormState = {
  error: null,
  saved: false,
};
