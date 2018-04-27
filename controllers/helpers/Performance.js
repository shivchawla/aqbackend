/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:15:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-27 12:15:22
*/

'use strict';
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const APIError = require('../../utils/error');
const config = require('config');
const WebSocket = require('ws'); 
const Promise = require('bluebird');
const PortfolioHelper = require('./Portfolio');
const DateHelper = require('../../utils/Date');
const WSHelper = require('./WSHelper');

function _checkPerformanceUpdateRequired(performanceDetail) {
	if(!performanceDetail) {
		return true;
	}

	if(performanceDetail && performanceDetail.updateDate) {
        if(DateHelper.compareDates(DateHelper.getDate(performanceDetail.updateDate), DateHelper.getCurrentDate()) == -1) {
        	 return true;
        }
    } else {
    	return true; 
    } 

    if(!performanceDetail.metrics) {
    	return true;
    }
        
    return false;
}

function _computeSimulatedHistoricalPerformance(portfolio, isAdvice) {
	
	return new Promise(function(resolve, reject) {
		var msg = JSON.stringify({action:"compute_simulated_historical_performance", 
        								portfolio: portfolio,
        								benchmark: portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'},
        								startDate: portfolio.startDate,
        								endDate: portfolio.endDate,
        								isAdvice: isAdvice}); 

		WSHelper.handleMktRequest(msg, resolve, reject);

	})
	.then(performance => {
		//FORMAT the output of portfolio values
		performance.portfolioValues = Object.keys(performance.portfolioValues).sort().map(date => {
			return {date: new Date(date), netValue: performance.portfolioValues[date]}
		})

		return performance;
	});

	//OLD OUTPUT FORMAT
	//{portfolioValues: portfolioValues, analytics: performance};
};

function _computeConstituentPerformance_portfolio(portfolio, startDate, endDate, benchmark) {
	return new Promise(function(resolve, reject) {
		var msg = JSON.stringify({action: "compute_portfolio_constituents_performance", 
	        				portfolio: portfolio,
	        				startDate: startDate,
	        				endDate: endDate,
	        				benchmark: benchmark});

		WSHelper.handleMktRequest(msg, resolve, reject);
		
	});
}

function _computeConstituentPerformance(portfolioId) {
	return PortfolioHelper.getPortfolioForDate(portfolioId, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio && portfolio.detail) {
			var currentPortfolio = portfolio.detail;
			//Check if start date is present (Added: 15/03/2018)
			var startDate = DateHelper.getDate(currentPortfolio.startDate);
			var endDate = DateHelper.getCurrentDate()
			return _computeConstituentPerformance_portfolio(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
		} else {
			APIError.throwJsonError({message: "Error computing constituent performance. Portfolio not found"});
		}
	});
}

function _computePortfolioMetrics_portfolio(portfolio, startDate, endDate, benchmark, isAdvice) {
	return new Promise(function(resolve, reject) {
		var msg = JSON.stringify({action: "compute_portfolio_metrics", 
	        				portfolio: portfolio,
	        				startDate: startDate,
	        				endDate: endDate,
	        				benchmark: benchmark,
	        				excludeCash: isAdvice ? true : false});

		WSHelper.handleMktRequest(msg, resolve, reject);
	});
}

function _computePortfolioMetrics(portfolioId, isAdvice) {
	return PortfolioHelper.getPortfolioForDate(portfolioId, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio && portfolio.detail) {
			var currentPortfolio = portfolio.detail;

			var startDate = DateHelper.getDate(currentPortfolio.startDate);
			var endDate = DateHelper.getCurrentDate();

			return _computePortfolioMetrics_portfolio(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}, isAdvice);
		} else {
			APIError.throwJsonError({message: "Error computing portfolio composition. Portfolio not found", portfolio: portfolioId});
		}
	});
}

function _computePerformance_portfolioHistory(portfolioHistory, benchmark, cashAdjustment) {
	return new Promise(function(resolve, reject) {
		var msg = JSON.stringify({action:"compute_performance_portfolio_history", 
	        				portfolioHistory: portfolioHistory,
	        				benchmark: benchmark,
	        				cashAdjustment: cashAdjustment ? true : false});

		WSHelper.handleMktRequest(msg, resolve, reject);
	})
	.then(performance => {
		performance.portfolioValues = Object.keys(performance.portfolioValues).sort().map(key => {
			return {date: new Date(key), netValue: performance.portfolioValues[key]};
		});	

		return performance;
	})

}

//Computes performance of true portfolio (using exact portfolio history) till date
// and cash adjustment if any (for advice)
function _computeTruePerformance(portfolioId, isAdvice) {
	return PortfolioHelper.getPortfolioHistory(portfolioId, null, {benchmark:1})
	.then(portfolio => {
		if (portfolio.history.length > 0) {
			var portfolioHistory = [];
			portfolio.history.forEach(item => {
				portfolioHistory.push({startDate: item.startDate, 
					//If end date is greater than current date,  make it current date
					endDate: DateHelper.compareDates(item.date, DateHelper.getCurrentDate()) == 1 ? DateHelper.getCurrentDate() : item.date,
					portfolio: {
						cash: item.cash,
						positions: item.positions
					}
				});
			});

			return _computePerformance_portfolioHistory(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}, isAdvice);
		} else {
			APIError.throwJsonError({message: "Error computing latest performance. Current portfolio and/or history missing"})
		}
	});
}

function _computeSimulatedPerformanceCurrentPortfolio(portfolioId, isAdvice) {
	return PortfolioHelper.getPortfolioForDate(portfolioId, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio && portfolio.detail){
			var currentPortfolio = portfolio.detail;

			var startDate = DateHelper.getCurrentDate(); 
			startDate = DateHelper.getDate(startDate.setDate(startDate.getDate() - 365));

			currentPortfolio.startDate = startDate;		

			return _computeSimulatedHistoricalPerformance(currentPortfolio, isAdvice);
		} else {
			APIError.throwJsonError({message: "Error computing simulated performance. Portfolio not found"});
		}
	});
}

function _computeLatestPerformance(portfolioId, isAdvice) {
	return Promise.all([
		_computeTruePerformance(portfolioId, isAdvice), //WORKS
		_computePortfolioMetrics(portfolioId, isAdvice), //WORKS
		_computeConstituentPerformance(portfolioId)
	]) 
	.then(([latestPerformance, portfolioMetrics, constituentPerformance]) => {
	
		if (latestPerformance && portfolioMetrics && constituentPerformance) {
			var latestPerformanceDate = DateHelper.getDate(latestPerformance.date);
	      	var portfolioMetricsDate = DateHelper.getDate(portfolioMetrics.date);
	      	var constituentPerformanceDate = DateHelper.getDate(constituentPerformance.date);

	      	var earliestDate = DateHelper.getDate(Math.min(latestPerformanceDate.getTime(), portfolioMetricsDate.getTime(), constituentPerformanceDate.getTime()));
			var updateMessage = "Updated successfully";

	  		var updates = {
	  			updateMessage: updateMessage, 
				updateDate: new Date(),
				metrics: {
					//earliest Date is IST date
					date:  DateHelper.getDate(earliestDate),
					portfolioMetrics: portfolioMetrics.value,
					portfolioPerformance: latestPerformance.value,
					constituentPerformance: constituentPerformance.value
				},

				portfolioValues: latestPerformance.portfolioValues
			};

			return updates;
		} else {
			APIError.throwJsonError({message:"Error while computing latest Performance"});
		}
	});
}

function _computeSimulatedPerformance(portfolioId, isAdvice) {
	return Promise.all([
		_computeSimulatedPerformanceCurrentPortfolio(portfolioId, isAdvice),
		_computePortfolioMetrics(portfolioId, isAdvice) //This is same as Current
	])
	.then(([simulatedPerformance, simulatedPortfolioMetrics]) => {
		if (simulatedPerformance && simulatedPortfolioMetrics) {

			var updates = {updateMessage: "Updated Successfully",
				updateDate: new Date(),
				metrics: {
					date:  DateHelper.getDate(simulatedPerformance.date),
					portfolioMetrics: simulatedPortfolioMetrics.value,
					portfolioPerformance: simulatedPerformance.value,
					constituentPerformance: null,
				},

				portfolioValues: simulatedPerformance.portfolioValues
			};

			return updates;
		} else {
			APIError.throwJsonError({message: "Error computing simulated performance"});
		}
	});
}

function _extractMetrics(allMetrics) {
	return {
		totalReturn: allMetrics && allMetrics.returns ? allMetrics.returns.totalreturn : 0.0,
		annualReturn: allMetrics && allMetrics.returns ? allMetrics.returns.annualreturn : 0.0,
		volatility: allMetrics && allMetrics.deviation ? allMetrics.deviation.annualstandarddeviation : 0.0,
		sharpe: allMetrics && allMetrics.ratios ? allMetrics.ratios.sharperatio : 0.0,
		beta: allMetrics && allMetrics.ratios ? allMetrics.ratios.beta : 0.0, 
		calmar: allMetrics && allMetrics.ratios ? allMetrics.ratios.calmarratio : 0.0, 
		information: allMetrics && allMetrics.ratios ? allMetrics.ratios.informationratio : 0.0, 
		alpha: allMetrics && allMetrics.ratios ? allMetrics.ratios.alpha : 0.0, 
		maxLoss: allMetrics && allMetrics.drawdown ? allMetrics.drawdown.maxdrawdown : 0.0,	
		currentLoss: allMetrics && allMetrics.drawdown ? allMetrics.drawdown.currentdrawdown : 0.0,
	};
}


//Change dailyChange and dailyChangePct
//Alos, include DailyPnl and PnlPct
function _extractPerformanceSummary(performance) {
	let performanceSummary;
	if (performance) {

		const summary = Object.assign({}, performance);

		var netValueArray = summary && summary.portfolioValues && summary.portfolioValues.length > 0 ? summary.portfolioValues.slice(-2) : null;

		var dailyNAVChangeEOD = 0.0;
		var dailyNAVChangeEODPct = 0.0;
		if(netValueArray && netValueArray.length > 1){
			var prices = netValueArray.map(item => item.netValue);
			dailyNAVChangeEOD = (prices[1] - prices[0]);
			dailyNAVChangeEODPct = prices[0] > 0.0 ? dailyNAVChangeEOD/prices[0] : 0.0;
		}

		dailyNAVChangeEOD = parseFloat(dailyNAVChangeEOD.toPrecision(2));
		dailyNAVChangeEODPct = parseFloat(dailyNAVChangeEODPct.toPrecision(4));

		var latestPortfolioValue = netValueArray && netValueArray.length > 0 ? netValueArray[netValueArray.length - 1] : null
		var trueMetrics = summary && summary.metrics && summary.metrics.portfolioPerformance && summary.metrics.portfolioPerformance.true ? summary.metrics.portfolioPerformance.true : null; 
		var diffMetrics = summary && summary.metrics && summary.metrics.portfolioPerformance && summary.metrics.portfolioPerformance.diff ? summary.metrics.portfolioPerformance.diff : null; 

		performanceSummary = Object.assign({diff: _extractMetrics(diffMetrics)}, 
			Object.assign({date: summary.updateDate,	
				dailyNAVChangeEOD: dailyNAVChangeEOD,
				dailyNAVChangeEODPct: dailyNAVChangeEODPct,
				netValueEOD: latestPortfolioValue ? latestPortfolioValue.netValue : null,
				netValueDate: latestPortfolioValue ? latestPortfolioValue.date : null,
				concentration: summary && summary.metrics && summary.metrics.portfolioMetrics ? summary.metrics.portfolioMetrics.concentration : 1.0,
				weights: summary && summary.metrics && summary.metrics.portfolioMetrics ? summary.metrics.portfolioMetrics.composition.map(item => item.weight) : []
			}, 
			_extractMetrics(trueMetrics))); 

	} else {
		performanceSummary = null;
	}

	return performanceSummary ? performanceSummary : {};		
}

module.exports.computePerformanceHypthetical = function(portfolio) {
	return new Promise((resolve,reject) => {
		if(portfolio) {
			resolve(PortfolioHelper.validatePortfolio(portfolio));
		} else {
			resolve(false);
		}
	})
	.then(validPortfolio => {	
		if (validPortfolio) { 

			var startDate = DateHelper.getDate(portfolio.detail.startDate);
			var endDate = DateHelper.getDate(portfolio.detail.endDate);

			return Promise.all([
				_computePortfolioMetrics_portfolio(portfolio.detail, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeConstituentPerformance_portfolio(portfolio.detail, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeSimulatedHistoricalPerformance(portfolio.detail, startDate, endDate)
			])
		} else if(!validPortfolio) {
			//this should not be called but in any-case
			APIError.throwJsonError({message: "Invalid Portfolio composition", errorCode: 1405});
		} 
	})
	.then(([portfolioMetrics, constituentPerformance, portfolioPerformance]) => {
		return {stockPerformance: constituentPerformance, portfolioPerformance: portfolioPerformance, portfolioMetrics: portfolioMetrics};
	});
};

module.exports.computePerformanceSummary = function(portfolioId, options) {
	
	var summaryType = options && options.simulated ? "simulated" : "current";
	return new Promise(resolve => {
		var opt = Object.assign(options ? options : {}, {fields: summaryType})
		exports.computePerformance(portfolioId, options)
		.then(performance => {
			if (performance){
				const pf = Object.assign({}, performance.toObject());
				return pf && pf[summaryType] ? _extractPerformanceSummary(pf[summaryType]) : null;
			} else {
				return null;
			}
		})
		.then(performanceSummary => {
			if (performanceSummary) {
				var nestedField = "summary."+summaryType;
				return PerformanceModel.updatePerformance({portfolio: portfolioId}, {$set: {[nestedField]: performanceSummary}}, {fields: [nestedField]})
					.then(pf => {return pf.summary ? pf.summary[summaryType] : null;});
			} else {
				return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: [nestedField]}).then(pf => {return pf.summary ? pf.summary[summaryType] : null;});
			}
		})
		.then(pf => {
			resolve(pf);
		})
		.catch(err => {
			console.log(err);
			//ERROR in performance calculation
			//Logging the error (needs IMPROVEMENT)
			//Instead of hard fail, computation continues with error message
			PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'summary.'[summaryType]}).then(pf => {return pf.summary ? pf.summary[summaryType] : null;})
			.then(pf => {
				resolve(pf);
			});
		});
	});
};

module.exports.getPerformanceSummary = function(portfolioId, simulatedFlag) {
	var summaryType = simulatedFlag ? "simulated" : "current";

	if (portfolioId) {
		return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'summary '.concat(summaryType)})
		.then(performance => {
			var updateRequired = _checkPerformanceUpdateRequired(performance ? performance[summaryType] : null);
			return updateRequired ? exports.computePerformanceSummary(portfolioId, {simulated: simulatedFlag}) : performance.summary[summaryType];
		})
	} else {
		APIError.throwJsonError({message: "Invalid Portfolio", portfolioId: portfolioId});
	}	
};

module.exports.computePerformance = function(portfolioId, options) {
	var performanceType = options && options.simulated ? "simulated" :  "current";
	return new Promise(resolve => {
		Promise.resolve()
		.then(v => {
		 	if(performanceType == "current") {
			 	return _computeLatestPerformance(portfolioId, options ? options.advice : false); 
		 	} else {
			 	return _computeSimulatedPerformance(portfolioId, options ? options.advice : false);
		 	}
		})
		.then(performance => {
			if (performance) {
				const updates = {$set: {[performanceType]: performance}};
				return PerformanceModel.updatePerformance({portfolio: portfolioId}, updates, {fields: options.fields});
			} else {
				return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: options.fields});
			}
		})
		.then(pf => {
			resolve(pf);
		})
		.catch(err => {
			console.log(err);
			PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: options.fields})
			.then(pf => {
				resolve(pf);
			});
		});
	});
};

module.exports.getPerformance = function(portfolioId, options) {
	var performanceType = options && options.simulated ? "simulated" :  "current" ;
	if (portfolioId) {
		var fields = options && options.fields ? options.fields : "";
		return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: fields.concat(' ').concat(performanceType)})
		.then(performance => {
			var updateRequired = _checkPerformanceUpdateRequired(performance ? performance[performanceType] : null);
			return updateRequired ? exports.computePerformance(portfolioId, {fields: fields, simulated: options ? options.simulated : false}) : performance;
		})
	} else {
		APIError.throwJsonError({message: "Invalid Portfolio", portfolioId: portfolioId});
	}
};

module.exports.computeAllPerformanceSummary = function(portfolioId, options) {
	return exports.computePerformanceSummary(portfolioId, options)
	.then(latestPerformanceSummary => {
		return Promise.all([
			latestPerformanceSummary,
			//compute simulated performance summary
			//Update the options to include simulated flag
			exports.computePerformanceSummary(portfolioId, Object.assign({simulated: true}, options ? options : {}))
		]);
	})
	.then(([latestPerformanceSummary, simulatedPerformanceSummary]) => {
		return {current: latestPerformanceSummary, simulated: simulatedPerformanceSummary};
	})
};

module.exports.computeAllPerformance = function(portfolioId) {
	return new Promise(resolve => {
		Promise.all([
			_computeSimulatedPerformance(portfolioId),
		 	_computeLatestPerformance(portfolioId)
	 	])
		.then(([simulatedPerformance, currentPerformance]) => {
			return Promise.all([
				simulatedPerformance,
				currentPerformance,
				_extractPerformanceSummary(currentPerformance),
				_extractPerformanceSummary(simulatedPerformance)
			])
		})
		.then(([simulatedPerformance, currentPerformance, latestPerformanceSummary, simulatedPerformanceSummary]) => {
			if (simulatedPerformance || currentPerformance || latestPerformanceSummary || simulatedPerformanceSummary) {
				const updates = {};
				if (simulatedPerformance) {
					updates["simulated"] = simulatedPerformance;
				}

				if(currentPerformance) {
					updates["current"] = currentPerformance;
				}

				if(latestPerformanceSummary || simulatedPerformanceSummary) {
					updates["summary"] = {};
				}

				if(latestPerformanceSummary) {
					updates["summary"]["current"] = latestPerformanceSummary;
				}

				if(simulatedPerformanceSummary) {
					updates["summary"]["simulated"] = simulatedPerformanceSummary;
				}

				return PerformanceModel.updatePerformance({portfolio: portfolioId}, {$set: updates}, {fields: 'current simulated summary'});
			} else {
				return PerformanceModel.fetchPerformance({portfolio: portfolioId});
				//APIError.throwJsonError({message: "Error computing either the simulated or latest performance", portfolio: portfolioId});	
			}
		})
		.then(pf => {
			resolve(pf);
		})
		.catch(err => {
			PerformanceModel.fetchPerformance({portfolio: portfolioId}).
			then(pf => {
				resolve(pf);
			})
		})
	});
};

module.exports.getAllPerformance = function(portfolioId) {
	if (portfolioId) {
		return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'current simulated summary'})
		.then(performance => {
			var updateRequired = _checkPerformanceUpdateRequired(performance ? performance.current : null);
			return updateRequired ? exports.computeAllPerformance(portfolioId) : performance;
		})
	} else {
		APIError.throwJsonError({message: "Invalid Portfolio", portfolioId: portfolioId});
	}
};

module.exports.computeAdvicePerformanceSummary = function(adviceId) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio'})
	.then(advice => {
		if (advice) {
			return Promise.all([
				exports.computeAllPerformanceSummary(advice.portfolio, {advice: true}),
				PortfolioHelper.computePortfolioAnalytics(advice.portfolio)
			]);
		} else {
			APIError.throwJsonError({message: "Advice not found", errorCode:1102});
		}
	})
	.then(([performanceSummary, portfolioAnalytics]) => {
		var currentPeformanceSummary = performanceSummary.current ? performanceSummary.current : {};
		performanceSummary.current = Object.assign(currentPeformanceSummary, portfolioAnalytics);

		return performanceSummary;
	})
	.catch(err => {
		return {error: err.message};
	});
};

//RECALCULATE IS NOT USED - 23/03/2018
module.exports.getAdvicePerformanceSummary = function(adviceId, recalculate) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'performanceSummary'})
	.then(advice => {
		if (!advice.performanceSummary || recalculate) {
			return exports.computeAdvicePerformanceSummary(adviceId);
		} else {
			return advice.performanceSummary
		}
	})
};


