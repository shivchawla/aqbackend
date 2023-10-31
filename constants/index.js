const Inf = 1000000000;

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
