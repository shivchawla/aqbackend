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

module.exports.contestRatingFields = [
	{field:"maxLoss", multiplier:-1}, 
	{field:"sharpe", multiplier:1}, 
	{field:"annualReturn", multiplier:1}, 
	{field:"totalReturn", multiplier:1}, 
	{field:"volatility", multiplier:-1}, 
	{field:"calmar", multiplier:1}, 
	{field:"alpha", multiplier:1}
];

module.exports.contestRankingScale = 5.0;