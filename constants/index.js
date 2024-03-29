module.exports.goals = [
	{
		investorType: 'Mix of Value and Growth Investors',
		field: "To invest in a divesified portfolio with a blend of value and growth stock",
		suitability: "Suitable for investors looking for diversification among value and growth investments in a single portfolio"
	},
	{	
		investorType: 'Growth Investors',
		field: "To achieve high rates of growth and capital appreciation",
		suitability: "Suitable for investors willing to tolerate high risk. The portfolio can undergo sudden downward swings and significant loses."
	},
	{
		investorType: "Capital Appreciation Investors",
		field: "To achieve capital appreciation over a long term",
		suitability: "Suitable for long term investors that seek growth over an extended period of time."
	},
	{
		investorType: "Value Investors",
		field: "To invest in underpriced stocks with sound underlying business assets",
		suitability: "Suitable for long term investors that seek underpriced stocks and growth potential over an extended period of time"	
	},
	{
		investorType: "Growth at Reasonable Price(GARP) Investors",
		field: "To seek high potential for growth with reasonable value characteristics",
		suitability: "Suitable for investors that seek high growth rates but lower than typical growth stocks. The portfolio can still undego large downward swings."	
	},
	{
		investorType: "Capital Preservation and Income Investors",
		field: "To invest in high dividend yield stocks and portfolio with high dividend yield",
		suitability: "Suitable for investors that seek high growth rates but lower than typical growth stocks. The portfolio can still undego large downward swings."	
	},
	{
		investorType: "Sector Exposure/Tracker",
		field: "To invest in stock with exposure to single sector",
		suitability: "Suitable for investors looking to invest in single sector and diversify risk in current portfolio."	
	}
];

const Inf = 1000000000;

module.exports.contestRatingFields = [
	{field:"monthly.true.totalReturn", multiplier:0, outputField: "totalReturn", default: -Inf, scale: 0},
	{field:"monthly.diff.annualReturn", multiplier:1, outputField: "annualReturn", default: -Inf, scale: 100}, //Ability to beat the market 
	{field:"monthly.diff.volatility", multiplier:-1, outputField: "volatility", default: Inf, scale: 50},  //Riskiness
	{field:"monthly.diff.maxLoss", multiplier:-1, outputField: "maxLoss", default: Inf, scale: 50}, //Downside Risk
	{field:"monthly.true.information", multiplier:1, outputField: "sharpe", default: -Inf, scale: 70}, //Consistency of returns
	{field:"monthly.diff.calmar", multiplier:1, outputField: "calmar", default: -Inf, scale: 70}, //Ability to recover
	{field:"concentration", multiplier:-1, outputField: "concentration", default: 0.0, scale: 20} //Portfolio Diverisification

];

module.exports.adviceRatingFields = [
	{field:"diff.annualReturn", multiplier:1, default: -Inf}, //Ability to beat the market 
	{field:"diff.volatility", multiplier:-1, default: Inf},  //Riskiness
	{field:"diff.maxLoss", multiplier:-1, default: Inf}, //Downside Risk
	{field:"information", multiplier:1, default: -Inf}, //Consistency of returns
	{field:"diff.calmar", multiplier:1, default: -Inf}, //Ability to recover
	{field:"concentration", multiplier:-1, default: 1.0} //Portfolio Diverisification
];

module.exports.adviceRankingScale = 5.0;
module.exports.contestRankingScale = 100.0;

const strongDiversified = {
	MIN_POS_COUNT: 10,
	MAX_STOCK_EXPOSURE: {
		HARD: 60000,
		SOFT: 50000
	},
	MAX_SECTOR_EXPOSURE: {
		SOFT: 180000,
		HARD: 210000
	},
	MIN_SECTOR_COUNT: 4,
	MIN_NET_VALUE: {
		SOFT: 450000,
		HARD: 400000
	}
}

const weakDiversified = {
	MIN_POS_COUNT: 10,
	MAX_STOCK_EXPOSURE: {
		HARD: 60000,
		SOFT: 50000
	},
	MAX_SECTOR_EXPOSURE: {
		SOFT: 250000,
		HARD: 300000
	},
	MIN_NET_VALUE: {
		SOFT: 450000,
		HARD: 400000
	}
}

const sector = {
	MIN_POS_COUNT: 10,
	MAX_STOCK_EXPOSURE: {
		HARD: 60000,
		SOFT: 50000
	},
	MAX_SECTOR_COUNT: 1,
	MIN_NET_VALUE: {
		SOFT: 450000,
		HARD: 400000
	}
};


//Allowed benchmarks for contest
module.exports.benchmarkUniverseRequirements = {
    "NIFTY_50" : {universe: "NIFTY_500", portfolio: strongDiversified}, 
    "NIFTY_MIDCAP_50": {universe: "NIFTY_MIDCAP_150", portfolio: strongDiversified},  
    "NIFTY_AUTO": {sector: "Automobile", universe: "NIFTY_500", portfolio: sector},
    "NIFTY_BANK": {sector: "Financial", industry: "Banking", universe: "NIFTY_500", portfolio: sector},
    "NIFTY_CONSUMPTION": {universe: "NIFTY_CONSUMPTION", portfolio: weakDiversified},
    "NIFTY_FIN_SERVICE": {sector: "Financial", universe: "NIFTY_500", portfolio: sector},
    "NIFTY_FMCG": {sector: "FMCG", universe: "NIFTY_500", portfolio: sector}, 
    "NIFTY_IT": {sector: "Technology", universe: "NIFTY_500", portfolio: sector},
    "NIFTY_MEDIA": {universe: "NIFTY_MEDIA", portfolio: weakDiversified},
    "NIFTY_METAL": {sector: "Metals", universe:"NIFTY_500", portfolio: sector},
    "NIFTY_PHARMA": {sector: "Healthcare", universe: "NIFTY_500", portfolio: sector},
    "NIFTY_PSU_BANK": {universe: "NIFTY_PSU_BANK", portfolio: weakDiversified},
    "NIFTY_REALTY":{sector: "Construction", industry: "Real Estate", universe: "NIFTY_500", portfolio: weakDiversified},
    "NIFTY_COMMODITIES": {universe: "NIFTY_COMMODITIES", portfolio: weakDiversified},
    "NIFTY_CPSE": {universe: "NIFTY_CPSE", portfolio: weakDiversified},
    "NIFTY_ENERGY": {sector: "Energy", universe: "NIFTY_500", portfolio: sector},
    "NIFTY_INFRA": {universe: "NIFTY_INFRA", portfolio: weakDiversified},
    "NIFTY_MNC": {universe: "NIFTY_MNC", portfolio: weakDiversified},
    "NIFTY_SERV_SECTOR": {universe: "NIFTY_SERV_SECTOR", portfolio: weakDiversified},
    "NIFTY_DIV_OPPS_50": {universe: "NIFTY_DIV_OPPS_50", portfolio: weakDiversified},
};
