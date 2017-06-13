/*
* @Author: Shiv Chawla
* @Date:   2017-05-09 13:41:52
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-22 14:06:06
*/

'use strict';

const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const PortfolioModel = require('../models/portfolio');
const UserModel = require('../models/user');
const Promise = require('bluebird');
const config = require('config');
const WebSocket = require('ws');   

exports.createPortfolio = function(args, res, next) {
	const userId = args.user._id;

	//Only investor can create a portfolio
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			return InvestorModel.getInvestor({_id: investorId}, {fields:'currentPortfolio'})
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(investor => {
		if(!investor.currentPortfolio.portfolio) {
			
			const portfolio = {
		        advisor: investorId,
		       	currentPortfolio: {
		       		startDate: args.body.value.startDate,
		       		endDate: args.body.value.endDate,
		       		portfolio: args.body.value.portfolio
	       		},
	       		benchmark: args.body.value.benchmark,
		       	createdDate: new Date(),
		       	updatedDate: new Date(),
		       	
		    };
						
			return _validateAndSavePortfolio(advice);
		} else {
			return res.status(400).json({investorId: investorId, message:"Cannot add more advices", errorCode: 5});
		}
		
	})
    .then(advice => {
    	console.log(advice);
    	console.log("here already");
    	if(advice) {
			return InvestorModel.addAdvice({
        		_id: investorId
			}, advice._id);
		} else {
			return res.status(400).json({message: "Invalid Portfolio"});
		}		
    })
    .then(advice => {
    	return res.status(200).json(advice);
    })
	.catch(err => {
    	next(err);
    });
};

exports.updatePortfolio = function(args, res, next) {
	const portfolioId = args.portfolioId.value;
	const investorId = args.investorId.value;

	const userId = args.user._id;

	const updates = args.body.value;
	updates.updatedDate = new Date();

	//Only author/advisor can update the advice
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if(user.investor == investorId ) {
				return InvestorModel.getInvestor({_id: investorId}, {fields:'portfolio'})
					
			} else { 
				return res.status(400).json({invetorId: investorId, message:"Not Authorized", errorCode: 1});
			} 
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(investor => {
		if(investor.portfolio) {
			var portfolioId = investor.portfolio._id;
			return _updatePortfolio(portfolioId, updates);	
		}

		return res.status(400).json({investorId:investorId, message:"No Portfolio found"});
	})
	.then(portfolio => {
		if(portfolio) {	
			return res.status(200).json(portfolio);
		}
	})
    .catch(err => {
    	next(err);
    });
};

exports.getPortfolio = function(args, res, next) {
	
	const portfolioId = args.portfolioId.value;
	const userId = args.user._id;

    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user) {
			return InvestorModel.getInvestor({_id: user.investor}, {fields:'portfolio'});
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(portfolio => {
		if(portfolio == portfolioId) {
			return PortfolioModel.getPortfolio({_id: portfolioId});
		} else {
			return res.status(400).json({userId: userId, message:"Not Authorized"}); 	
		}
	})
	.then(portfolio)
  	.catch(err => {
    	next(err);
    });	
};


/*
	Logic: Position Detail depends on
		a. Portfolio Id
		b. Symbol

		How to know if portfolioId belongs to the user?

		User can own the portfolio...
				OR
		User is merely inspecting the "SUBSCRIBED" or "CREATED" advice portfolio
*/


exports.getPositionDetail = function(args, res, next) {
	const userId = args.user._id;
	const portfolioId = args.portfolioId.value;
	const positionSymbol = args.symbol.value;
};

exports.getAdviceHistory = function(args, res, next) {
	const investorId = args.investorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    options.fields = args.fields.value;

    if (!options.fields) {
    	options.fields = 'advisor portfolioHistory performanceHistory ratingHistory';
    }
    
    //Only the investor and author can see the advice history
    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user){
    		if(user.isInvestor || (user.isInvestor && user.advisor == investorId)){
				return InvestorModel.getInvestor({_id: investorId}, {fields:'advices'});
			} else {
				return res.status(400).json({message:"Not authorized"});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output.advices) {
			var ids = output.advices;
			if(ids.indexOf(adviceId) != -1) {
				return AdviceModel.getAdvice({_id:adviceId}, options)
			} 
		} else { 
			return res.status(400).json({investorId:investorId, adviceId:adviceId, message:"No Advice found"});
		}
	})
	.then(adviceHistory => {
		if(adviceHistory) {
			return res.status(200).json(adviceHistory);
		} else {
			return res.status(400).json({investorId:investorId, adviceId:adviceId, message:"No Advice found"});
		}
	})
  	.catch(err => {
    	next(err);
    });
};

exports.deleteAdvice = function(args, res, next) {
	const investorId = args.investorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if (user.isInvestor && user.advisor == investorId) {
				return InvestorModel.getInvestor({_id: investorId}, {fields:'advices'})
			} else {
				return res.status(400).json({message:"Not authorized"});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output.advices) {
			var ids = output.advices;
			if(ids.indexOf(adviceId) != -1) {
				return InvestorModel.removeAdvice({_id:investorId}, adviceId);
			} 
		}

		return res.status(400).json({investorId:investorId, adviceId:adviceId, message:"No Advice found"});

	})
	.then(advisor => {
		if(advisor){
			return AdviceModel.deleteAdvice({_id: adviceId});
		} 
			
	})
	.then(advice => {
		if(advice){
			return res.status(200).json({investorId:investorId, adviceId:adviceId, message:"Deleted Successfully"});
		}
	})
  	.catch(err => {
    	next(err);
    });
};

exports.followAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	UserModel.fetchUser({_id: userId})
  	.then(user => {
  		if(user) {
  			if (user.isInvestor) {
	    		
	    		const investorId = user.investor; 
	    		
	    		return Promise.all([AdviceModel.updateFollowers({
	    						_id: adviceId}, investorId),

							InvestorModel.updateFollowing({
				    			_id: investorId}, adviceId, "advice"
							    		)]);
			} else {
				return res.status(400).json({userId: userId, message: "Not Authorized"});
			}
		} else {
			return res.status(400).json({userId: user._id, message: "User not found"});
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({followers:advice.followers, count: advice.followers.length}); 
		} else if(!investor) {
			return res.status(400).json({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			return res.status(400).json({adviceId: adviceId, message: "No Advice found"});
		}
	})
    .catch(err => {
        next(err);
    });
};

exports.subscribeAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	UserModel.fetchUser({_id: userId})
  	.then(user => {
  		if(user) {
  			if (user.isInvestor) {
	    		
	    		const investorId = user.investor; 
	    		
	    		return Promise.all([AdviceModel.updateSubscribers({
	    						_id: adviceId}, investorId),

							InvestorModel.updateSubscription({
				    			_id: investorId}, adviceId
							    		)]);
			} else {
				return res.status(400).json({userId: userId, message: "Not Authorized"});
			}
		} else {
			return res.status(400).json({userId: user._id, message: "User not found"});
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({investorId: investor._id, adviceId: advice._id, message: "Subscribed updated successfully"}); 
		} else if(!investor) {
			return res.status(400).json({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			return res.status(400).json({adviceId: adviceId, message: "No Advice found"});
		}
	})
    .catch(err => {
        next(err);
    });
};

function _updateAdvice(adviceId, updates) {
	
	return new Promise(function(resolve, reject) {

	if(updates.portfolio) {
		//validate the portfolio
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_portfolio", 
            				portfolio: updates.portfolio});

            console.log(msg);

         	wsClient.send(msg);
        });


        wsClient.on('message', function(msg) {
        	console.log('On validation message');
        	console.log(msg);

        	var data = JSON.parse(msg);
			
			console.log(data);
        	
        	wsClient.close();

        	if (data["valid"] == true) {
        		resolve(AdviceModel.updateAdvice({_id: adviceId}, updates));
        		
		    }
	    });
	} else {
		resolve(AdviceModel.updateAdvice({_id: adviceId}, updates));
	}

	});
	
}

function _validateAndSaveAdvice(advice) {

	return new Promise(function(resolve, reject) {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_portfolio", 
            				portfolio: advice.currentPortfolio.portfolio});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	console.log('On validation message');
        	console.log(msg);

        	var data = JSON.parse(msg);
			
			console.log(data);
        	
        	wsClient.close();

        	if (data["valid"] == true) {
			    resolve(AdviceModel.saveAdvice(advice))
		    } else {
		    	reject();
		    }
	    });
    });
}


function _updateAdviceWithCurrentPortfolioPerformance(advice) {
	
	console.log("_updateAdviceWithCurrentPortfolioPerformance(advice)");

	var needPerformanceUpdate = false;
	var endDate = new Date();

	if (advice.currentPortfolio.performanceMetrics) {

		var nMetrics = advice.currentPortfolio.performanceMetrics.length;

		if(nMetrics > 0) {
			var lastUpdatedDate = advice.currentPortfolio.performanceMetrics[nMetrics -1].date;
		
			//TODO : FINANCIAL Calendar

			if (lastUpdatedDate.getTime() < advice.currentPortfolio.endDate.getTime()) {

				lastUpdatedDate.setDate(lastUpdatedDate.getDate() + 1);

				var today = new Date();
				today.setHours(0, 0, 0, 0);

				if(today.getTime() > lastUpdatedDate.getTime()) {
					needPerformanceUpdate = true;
					if(advice.currentPortfolio.endDate.getTime() > today.getTime()) {
						endDate = today;
					} else {
						endDate = advice.currentPortfolio.endDate;
					}
				}
			}
		} else {
			needPerformanceUpdate = true;
			endDate = advice.currentPortfolio.endDate;
		}

	} else {
		console.log("Hola");
		needPerformanceUpdate = true;
		endDate = advice.currentPortfolio.endDate;
	}


	return new Promise(function(resolve, reject) {
		if(needPerformanceUpdate) {

			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);
		        console.log("khf:: compute_portfolio_value");
		        var msg = JSON.stringify({action:"compute_portfolio_value_period", 
		        				portfolio: advice.currentPortfolio.portfolio, startDate:advice.currentPortfolio.startDate, endDate:endDate});

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	//console.log("result");
		    	//console.log(data);

		    	if(data['error'] == '' && data['netValue']) {
		    		
		    		//console.log("mohammad");
		    		//console.log(data);

		    		// reformat date to JS
		    		resolve(AdviceModel.updateCurrentPortfolioPortfolioStats(advice._id, data['netValue']));
		    		
				} else {
					resolve(advice);
				}
			});
		} else {
			return resolve(advice);
		}
	})
	.then(advice => {
		return new Promise(function(resolve, reject) {
			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);
		        var msg = JSON.stringify({action:"compute_performance_netvalue", 
		        				netValue: advice.currentPortfolio.portfolioStats.map(x=>x.netValue),
		        				dates: advice.currentPortfolio.portfolioStats.map(x=>x.date),
		        				benchmark: advice.benchmark});

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	//console.log("dfdfd");
		    	//console.log(data);

		    	if(data['error'] == '' && data['performance']) {
		    		
		    		//console.log(data);

		    		// reformat date to JS
		    		resolve(AdviceModel.updateCurrentPortfolioPerformance(advice._id, data['performance']));
		    		
				} else {
					resolve(advice);
				}
			});
			 
		});
	});
}

function _updateAdviceWithAdvicePerformance(advice) {
		
	console.log("Here");		
	var needPortfolioValueUpdate = false;
	
	if (advice.portfolioStats) {
		
		var nPortfolioStats = advice.portfolioStats.length;
		if (nPortfolioStats > 0) {
			var lastUpdatedDate = advice.portfolioStats[nPortfolioStats - 1].date;
			lastUpdatedDate.setDate(lastUpdatedDate.getDate() + 1);

			var today = new Date();
			today.setHours(0, 0, 0, 0);

			if(today.getTime() > lastUpdatedDate.getTime()) {
				needPortfolioValueUpdate = true;
			}
		} else {
			needPortfolioValueUpdate = true;
		}

	} else {
		needPortfolioValueUpdate = true
	}

	//console.log("Shivaaaaa");
	//console.log(needPortfolioValueUpdate);
					
	return new Promise(function(resolve, reject) {
		if (needPortfolioValueUpdate) {
		// Create websocket connection and 
		// ask Julia process to compute the 
		// performance
		
			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);

		        var msg = JSON.stringify({action:"compute_portfolio_value_history", 
	        								portfolioHistory: advice.portfolioHistory}); 

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	if(data['error'] == '' && data['netValue']) {
		    		
		    		console.log(data);
	    			resolve(AdviceModel.updateAdvicePortfolioStats(advice._id, data['netValue']));
		    		
				} else {
					resolve(advice);
				}
			});
		
		} else {
			resolve(advice);
		}
	})
	.then(advice => {
		return new Promise(function(resolve, reject) {

			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);

		        var msg = JSON.stringify({action:"compute_performance_netvalue", 
	        								netValue: advice.portfolioStats.map(x=>x.netValue),
	        								dates: advice.portfolioStats.map(x=>x.date),
	        								benchmark: advice.benchmark}); 

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	if(data['error'] == '' && data['performance']) {
		    		
		    		//console.log(data);

	    			resolve(AdviceModel.updateAdvicePerformance(advice._id, data['performance']));
		    		
				} else {
					resolve(advice);
				}
			});

		});
	});
} 

function _updateAdviceWithPerformance(advice) {

	return _updateAdviceWithCurrentPortfolioPerformance(advice)
	.then(advice => {
		return _updateAdviceWithAdvicePerformance(advice);
	});
}









