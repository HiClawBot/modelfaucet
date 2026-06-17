import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createFaucet, type FaucetClient, type FaucetOptions } from "@modelfaucet/sdk";

export type FaucetProviderProps = {
  publicAppId: string;
  userId?: string;
  user?: FaucetOptions["user"];
  baseUrl?: string;
  gatewayBaseUrl?: string;
  client?: FaucetClient;
  children: ReactNode;
};

const FaucetContext = createContext<FaucetClient | undefined>(undefined);

function resolveUser(props: FaucetProviderProps): FaucetOptions["user"] {
  if (props.user !== undefined) {
    return props.user;
  }

  if (props.userId !== undefined && props.userId.length > 0) {
    return { id: props.userId };
  }

  throw new Error("FaucetProvider requires either user or userId.");
}

export function FaucetProvider(props: FaucetProviderProps) {
  const client = useMemo(() => {
    if (props.client !== undefined) {
      return props.client;
    }

    return createFaucet({
      publicAppId: props.publicAppId,
      user: resolveUser(props),
      baseUrl: props.baseUrl,
      gatewayBaseUrl: props.gatewayBaseUrl
    });
  }, [
    props.baseUrl,
    props.client,
    props.gatewayBaseUrl,
    props.publicAppId,
    props.user,
    props.userId
  ]);

  return <FaucetContext.Provider value={client}>{props.children}</FaucetContext.Provider>;
}

export function useFaucet(): FaucetClient {
  const client = useContext(FaucetContext);
  if (client === undefined) {
    throw new Error("useFaucet must be used inside FaucetProvider.");
  }

  return client;
}
