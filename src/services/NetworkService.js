import Network from "../models/Network";
import config from "../util/config";

export const network = Network.fromJson({
	host:config('NET_HOST'),
	port:config('NET_PORT'),
	protocol:config('NET_PROTOCOL'),
	chainId:config('NET_CHAIN_ID'),
	blockchain:'eos',
});

