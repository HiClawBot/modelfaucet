export { FaucetChat, type FaucetChatProps } from "./FaucetChat";
export { FaucetProvider, useFaucet, type FaucetProviderProps } from "./FaucetProvider";
export type { FaucetChatInput, FaucetChatResult, FaucetClient } from "@modelfaucet/sdk";

export const reactPackage = {
  name: "@modelfaucet/react",
  hiddenByokMarkup: false
} as const;
