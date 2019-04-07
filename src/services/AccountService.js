import Eos from 'eosjs';
import {network} from "./NetworkService";
import ridl from "ridl";
import config from "../util/config";

const randomName = () => {
	const size = 12;
	let text = "";
	const possible = "abcdefghij12345";
	for(let i=0; i<size; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
	return text;
}

const eos = Eos({
	httpEndpoint:network.fullhost(),
	chainId:network.chainId,
	keyProvider:[config('ACCOUNT_CREATOR_KEY')]
});

let contract;
const getTokenContract = async () => {
	if(!contract) contract = await eos.contract('ridlridlcoin');
	return contract;
}

export default class AccountService {

	static async faucet(name){
		const accountBalance = await ridl.identity.accountBalance(name, true).catch(() => 0);
		if(accountBalance >= 100) return false;

		const token = await getTokenContract();
		const deltaTokens = parseFloat(100 - accountBalance).toFixed(4);
		return token.transfer('scatterfunds', name, `${deltaTokens} RIDL`, '', {authorization:['scatterfunds@active']})
			.then(() => true).catch(() => false);
	}

	static async createAccount(key){

		let name = randomName();

		const nameExists = () => eos.getAccount(name).then(() => true).catch(() => false);

		let exists = await nameExists();
		while(!isNaN(name[0]) || exists){
			name = randomName();
			exists = await nameExists();
		}

		const creator = 'eosio';

		return eos.transaction(tr => {
			tr.newaccount({
				creator: creator,
				name: name,
				owner: key,
				active: key
			})

			tr.buyrambytes({
				payer: creator,
				receiver: name,
				bytes: 20000
			})

			tr.delegatebw({
				from: creator,
				receiver: name,
				stake_net_quantity: '1.0000 EOS',
				stake_cpu_quantity: '50.0000 EOS',
				transfer: 0
			})

			tr.transfer(creator, name, '100.0000 EOS', '');
		}).then(async done => {

			await this.faucet(name);

			return {
				name,
				authority:'active',
				publicKey:key,
				chainId:network.chainId
			}
		}).catch(() => false)
	}

}