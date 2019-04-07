import "isomorphic-fetch"
import {buildQuery, n1ql} from "../database/couchbase"; // eslint-disable-line
import ridl, {Reputable} from 'ridl';
import {network} from "./NetworkService";

ridl.init(network);

let bucket;


const PER_PAGE = 12;

export default class QueryService {

	static setBucket(_b){
		bucket = _b;
	}

	static async getFeed(id, page = 0){
		const query = buildQuery(`SELECT * FROM ridl WHERE actionType = 'repute' AND id = ${id} LIMIT ${PER_PAGE*2} OFFSET ${page*PER_PAGE*2}`);
		return (await bucket.query(query).then(x => x.map(y => y.ridl)).catch(() => []));
	}

	static async getRecentFeed(page = 0){
		const query = buildQuery(`SELECT * FROM ridl WHERE docType = 'action' ORDER BY timestamp DESC LIMIT ${PER_PAGE*2} OFFSET ${page*PER_PAGE*2}`);
		return (await bucket.query(query).then(x => x.map(y => y.ridl)).catch(() => []));
	}

	static async search(terms, page = 0){
		const query = buildQuery(`SELECT DISTINCT *  FROM ridl WHERE docType = 'reputable' AND entity LIKE '${terms}%' LIMIT ${PER_PAGE} OFFSET ${page*PER_PAGE}`);
		const results = (await bucket.query(query).then(x => x.map(y => y.ridl)).catch(() => []));

		return await Promise.all(results.map(async raw => {
			const reputable = Reputable.fromJson(raw);
			await ridl.reputation.getReputationAndParents(reputable);
			reputable.children = await ridl.reputation.searchByParent(reputable.id);
			return reputable;
		}))
	}

	static async getReputable(id){
		const raw = await bucket.get(`reputable:${id}`).then(x => x.value).catch(() => null);
		if(!raw) return;
		const reputable = Reputable.fromJson(raw);
		await ridl.reputation.getReputationAndParents(reputable);
		reputable.children = await ridl.reputation.searchByParent(reputable.id);
		return reputable;
	}

}






