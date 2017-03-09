/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-09 22:53:07
*/

'use strict';
const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const AdviceModel = require('../models/advice');
const UserModel = require('../models/user');
const Promise = require('bluebird');
const config = require('config');
const WebSocket = require('ws');   
const defaultFields = 

exports.createAdvice = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const userId = args.user._id;

	// Only author/advisor can create an advice
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if(user.isAdvisor && user.advisor == advisorId) {
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'})
			} else {
				return res.status(400).json({advisorId: advisorId, message:"Not Authorized", errorCode: 1});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(advisor => {
		if(advisor.advices) {
			var advices = advisor.advices;

			if(advices.length < config.get('max_advices_per_advisor')) {

				const advice = {
			        advisor: advisorId,
			       	currentPortfolio: {
			       		startDate: args.body.value.startDate,
			       		endDate: args.body.value.endDate,
			       		portfolio: args.body.value.portfolio
		       		},
		       		benchmark: args.body.value.benchmark,
			       	createdDate: new Date(),
			       	updatedDate: new Date(),
			       	
			    };
						
				return _validateAndSaveAdvice(advice);
			} else {
				return res.status(400).json({advisorId: advisorId, message:"Cannot add more advices", errorCode: 5});
			}
		}
	})
    .then(advice => {
    	console.log(advice);
    	console.log("here already");
    	if(advice) {
			return AdvisorModel.addAdvice({
        		_id: advisorId
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

exports.updateAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const advisorId = args.advisorId.value;

	const userId = args.user._id;

	const updates = args.body.value;
	updates.updatedDate = new Date();

	//Only author/advisor can update the advice
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if(user.isAdvisor && user.advisor == advisorId ) {
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'})
					
			} else { 
				return res.status(400).json({advisorId: advisorId, message:"Not Authorized", errorCode: 1});
			} 
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output.advices) {
			var adviceIds = output.advices;
			if(adviceIds.indexOf(adviceId) != -1) {
				return _updateAdvice(adviceId, updates);	
			}
		}

		return res.status(400).json({advisorId:advisorId, message:"No Advice found"});
	})
	.then(advice => {
		if(advice) {	
			return res.status(200).json(advice);
		}
	})
    .catch(err => {
    	next(err);
    });
};

exports.getAdvices = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const userId = args.user._id;
    
	const options = {};
    options.fields = args.fields.value;

    if (!options.fields) {
    	options.fields = 'advisor metrics netValue createdDate updatedDate approved';
    }

    //Only the investor and author can see the advice history
    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user) {
    		if(user.isInvestor || (user.isAdvisor && user.advisor == advisorId)){
    			return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'});
			} else {
				return res.status(400).json({userId:userId, message:"Not Authorized"});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output) {
			var adviceIds = output.advices;
			const userId = args.user._id;
		  	return Promise.all([AdviceModel.getAdvices({_id: {$in: adviceIds}}, options),
		  						UserModel.fetchUser({_id: userId})]);
	  	} else {
		  	return res.status(400).json({advisorId:advisorId, message:"No Advice found"});
	  	}
  	})
  	.then(([advices, user]) => {
	  	
	  	if (user.isAdvisor) {
	  		return advices;
	  	} else {
	  		
	  		// Filter advices if user is not the advisor himself or if not subscribed
			// If user in an investor, he must first subscribe to the idea
	  		var advicesForInvestor = [];
	  		advices.forEach(advice => {
	            var subscribers = advice.subscribers.map(x => x.subscriber);
	            
	            //************
	            //TODO: create seprate set of options for subscribed and unsubscribed investor
	            //************
	            if (subscribers.indexOf(user.investor) != -1) {
	            	advicesForInvestor.push(advice);
	            } else {
	            	advicesForInvestor.push(advice);
	            }
        	});

	  		return advicesForInvestor;
	  	}

	  	return res.status(400).json({message:"No advices found"});

  	})
  	.then(advices => {
		return res.status(200).json(advices);
	})
  	.catch(err => {
    	next(err);
    });
};

exports.getAdvice = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    options.fields = args.fields.value;

    if (!options.fields) {
    	options.fields = 'advisor portfolioHistory currentPortfolio portfolioStats performanceMetrics createdDate updatedDate approved';
    } else {
    	options.fields = options.fields.replace(',',' ');
    	if(options.fields.indexOf('approved') == -1) {
    		options.fields.concat(' approved');
    	}
    }

    //Only the investor and author can see the advice history
    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user) {
    		if(user.isInvestor || (user.isAdvisor && user.advisor == advisorId)){
    			return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'});
			} else {
				return res.status(400).json({message:"Not authorized"});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output.advices) {
			var adviceIds = output.advices;

			if(adviceIds.indexOf(adviceId) != -1) {
				// Create promise returning advices 
				return Promise.all([AdviceModel.getAdvice({_id: adviceId}, options),
		  						UserModel.fetchUser({_id: userId})]);
		  	} 
	  	} else {
			return res.status(400).json({advisorId: advisorId, adviceId: adviceId, message:"No Advice found"});
		}
  	})
  	.then(([advice, user]) => {
	  	if(advice && user) {
		  	if (user.isAdvisor) {
		  		return advice;
		  	} else {
		  		
		  		// Filter advices if user is not the advisor himself or if not subssribed
				// If user in an investor, he must first subscribe to the idea
	  		    var subscribers = advice.subscribers.map(x => x.subscriber);
		            
	            //************
	            //TODO: create seprate set of options for subscribed and unsubscribed investor
	            //************
	            
	            if(advice.approved) {
		            if (subscribers.indexOf(user.investor) != -1) {
		            	return advice;
		            } else {
		            	//filter and send only the performance
		            	var keys = ['advisor' , 'portfolioStats', 'performanceMetrics', 'createdDate', 'updatedDate', 'approved'];
		            	
		            	var filteredAdvice = {};
		            	keys.forEach(key => {
		            		if(advice[key]) {
		            			filteredAdvice[key] = advice[key];
	            			}
		            	});

		            	return filteredAdvice;	
		            	
		            }
	            } else {
	            	return res.status(400).json({advisorId:advisorId, adviceId: adviceId, message:"Advice not approved"});
	            }
		  	}
	  	}

	  	return res.status(400).json({advisorId:advisorId, adviceId: adviceId, message:"No Advice found"});

  	})
  	.then(advice => {

  		if (advice) {

  			if (options.fields.indexOf('performanceMetrics') != -1 || options.fields.indexOf('currentPortfolio') != -1) {
  				
  				if (options.fields.indexOf('performanceMetrics') != -1) {
  					return _updateAdviceWithPerformance(advice);
				} else {
					return _updateAdviceWithCurrentPortfolioPerformance(advice);
				}
			}
		
			return advice;	 
		
		} else {
			return res.status(400).json({message:'No advice found'});
		}
	})	
	.then(advice => {
		return res.status(200).json({advice});
	})
  	.catch(err => {
    	next(err);
    });	
};

exports.getAdviceHistory = function(args, res, next) {
	const advisorId = args.advisorId.value;
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
    		if(user.isInvestor || (user.isAdvisor && user.advisor == advisorId)){
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'});
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
			return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});
		}
	})
	.then(adviceHistory => {
		if(adviceHistory) {
			return res.status(200).json(adviceHistory);
		} else {
			return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});
		}
	})
  	.catch(err => {
    	next(err);
    });
};

exports.deleteAdvice = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if (user.isAdvisor && user.advisor == advisorId) {
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'})
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
				return AdvisorModel.removeAdvice({_id:advisorId}, adviceId);
			} 
		}

		return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});

	})
	.then(advisor => {
		if(advisor){
			return AdviceModel.deleteAdvice({_id: adviceId});
		} 
			
	})
	.then(advice => {
		if(advice){
			return res.status(200).json({advisorId:advisorId, adviceId:adviceId, message:"Deleted Successfully"});
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









