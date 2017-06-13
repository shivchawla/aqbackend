/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-26 13:41:30
*/

'use strict';
const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const AdviceModel = require('../models/advice');
const UserModel = require('../models/user');
const Promise = require('bluebird');
const config = require('config');
const WebSocket = require('ws'); 
const HelperFunctions = require("./helpers");  

exports.createAdvice = function(args, res, next) {
	const userId = args.user._id;

	// Any one can create an advice
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			return AdvisorModel.getAdvisor({_id: user.advisor}, {fields:'advices'})
		} else {
			throw new Error({userId: userId, message:"User not found"});
			//return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(advisor => {
		if(advisor) {
			var advices = advisor.advices;

			if(advices.length < config.get('max_advices_per_advisor')) {

				const advice = {
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
				throw new Error({userId: userId, message:"Cannot add more advices", errorCode: 5});
				//return res.status(400).json({advisorId: advisorId, message:"Cannot add more advices", errorCode: 5});
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
			throw new Error({message: "Invalid Portfolio"});
			//return res.status(400).json({message: "Invalid Portfolio"});
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
	
	const userId = args.user._id;

	const updates = args.body.value;
	
	//Only author/advisor can update the advice
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			return AdvisorModel.getAdvisor({_id: user.advisor}, {fields:'advices'})
		} else {
			throw new Error({userId: userId, message:"User not found"})
			//return res.status(400).json(); 
		}
	})
	.then(advisor => {
		if(advisor) {
			var adviceIds = advisor.advices;
			
			if(adviceIds.indexOf(adviceId) != -1) {
				return AdviceModel.getAdvice({_id: adviceId},'portfolio');
			} else {
				throw new Error({userId: userId, message:"Advice not found"});
			}
		} else {
			throw new Error({userId: userId, message:"Advice not found"});
		}
		//return res.status(400).json({advisorId:advisorId, message:"No Advice found"});
	})
	.then(advice => {
		if(advice) {	
			HelperFunctions.updatePortfolio(advice.currentPortfolio, updates);
		}
	})
    .catch(err => {
    	next(err);
    });
};

exports.getAdvices = function(args, res, next) {
	const userId = args.user._id;
    
	/*const options = {};
    options.fields = args.fields.value;

    if (!options.fields) {
    	options.fields = 'metrics netValue createdDate updatedDate approved';
    }*/

    //Only the investor and author can see the advice history
    UserModel.fetchUser({_id:userId})
    .then(user => {
		if(user) {
	    	return Promise.all([InvestorModel.getInvestor({_id: user.investor}, {fields: 'followingAdvices, subscribedAdvices'}),
    						AdvisorModel.getAdvisor({_id: user.advisor}, 'advices')]);
		} else {
			throw new Error({userId: userId, message:"User not found"});
			//return res.status(400).json(); 
		}
	})
	.then(([investor, advisor]) => {

		var advices = [];
		if(investor) {
			advices.push(investor.followingAdvices);
			advices.push(investor.subscribedAdvices);
		}

		if(advisor) {
			advices.push(advisor.advices)
		}

		return Promise.all(advices.map(
			function(advice) {
				var type = "";
				type = investor.followingAdvices.map(item => item._id).indexOf(advice._id) != -1 ? "followed" : type;
				type = investor.subscribedAdvices.map(item => item._id).indexOf(advice._id) != -1 ? "subscribed" : type;
				type = advisor.advices.map(item => item._id).indexOf(advice._id) != -1 ? "personal" : type;
				
				return {type: type,
						advice: HelperFunctions.getUpdatedAdviceSummary(advice._id)};
			})
		);

	})
	.then(adviceSummaryList => {
		if (adviceSummaryList) {
			return res.status(200).json(adviceSummaryList);
		} else {
			throw new Error({message: "No advices found"});
			//return res.status(400).json();
		}
	})
	.catch(err => {
		next(err);
	});
};


exports.getAdviceSummary = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    options.fields = 'portfolioStats performanceMetrics createdDate updatedDate approved';

    //LOGIC:
    // Does the user own this advice
    // Is the user subscribed to this advice
    // Is the user following this advice

 	Promise.all([HelperFunctions.isAdvicePersonal(userId, adviceId),
 				HelperFunctions.isAdviceFollowing(userId, adviceId),
 				HelperFunctions.isAdviceSubscribed(userId, adviceId)])
 	.then(([personal, following, subscribed]) => {
 		if(personal || following || subscribed ) {
 			return HelperFunctions.getUpdatedAdviceSummary(adviceId);
 		} else {
 			throw new Error({message:"Not authorized"});
 			//return res.status(400).json();
 		}
 	})
 	.then(adviceSummary => {
 		if (adviceSummary) {
			return res.status(200).json(adviceSummary);
		} else {
			throw new Error({message:'No advice found'});
			//return res.status(400).json({message:'No advice found'});
		}
 	})
 	/*.then(advice => {
 		return res.status(200).json(advice);
 	})*/
 	.catch(err => {
    	next(err);
    });    
};

exports.getAdviceDetail = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    
	Promise.all([HelperFunctions.isAdvicePersonal(userId, adviceId),
 				HelperFunctions.isAdviceFollowing(userId, adviceId),
 				HelperFunctions.isAdviceSubscribed(userId, adviceId)])
 	.then(([personal, following, subscribed]) => {
 		if(personal || subscribed) {
 			options.fields = 'portfolioHistory, currentPortfolio, portfolioStats, performanceMetrics, createdDate, updatedDate, approved';
 		} else if(following) {
 			options.fields = 'portfolioStats, performanceMetrics, createdDate, updatedDate, approved';
 		} else {
 			throw new Error({message:"Not authorized"});
 			//return res.status(400).json({message:"Not authorized"});
 		}

 		return HelperFunctions.getUpdatedAdviceSummary({_id: adviceId}); 
 	})
 	.then(adviceDetail => {
 		if (adviceDetail) {
			return res.status(200).json(adviceDetail);	
		} else {
			throw new Error({message:'No advice found'});
			//return res.status(400).json({message:'No advice found'});
		}
 	})
 	.catch(err => {
    	next(err);
    });
};

/*exports.getAdvice = function(args, res, next) {
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
};*/

exports.updateAdvicePortfolio = function(args, res, next) {
	const userId = args.user._id;
	const adviceId = args.advice._id;

	const transactions = args.body.value;

	UserModel.fetchUser({_id: userId})
	.then(user => {
		if(user) {
			return AdvisorModel.getInvestor({_id: user.advisor}, 'advices');
		}
	})
	.then(advisor => {
		if(advisor) {
			if(advisor.advices.indexOf(adviceId) != -1) {
				return AdviceModel.getAdvice({_id: adviceId}, 'currentPortfolio')
			}	
		}
	})
	.then(advice => {
		if(advice) {
			return PortfolioModel.clonePortfolio({_id: advice.portfolio});
		}
	})
	.then(clonePortfolioId => {
		return Promise.all([AdviceModel.updatePortfolioHistory({_id: adviceId}, clonePortfolioId),
					HelperFunctions.updatePortfolio({_id: advice.currentPortfolio}, transactions)]);	
	})
	/*.then(([updated, portfolio]) => {
		if(portfolio) {
			AdviceModel.addTransactions({_id: adviceId}, {stockTransactions: transactions})
		}
	})*/
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
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			return AdvisorModel.getAdvisor({_id: user.advisor}, {fields:'advices'})		
		} else {
			throw new Error({userId: userId, message:"User not found"}); 
		}
	})
	.then(advisor => {
		if(advisor) {
			var advices = output.advices;
			
			if(advices.indexOf(adviceId) != -1) {
				return Promise.all([AdvisorModel.removeAdvice({_id:advisor._id}, adviceId),
									AdviceModel.deleteAdvice({_id: adviceId})]);
			} else {	
				throw new Error({userId:userId, adviceId:adviceId, message:"No Advice found"})
			} 
		}

	})
	.then(([advisor, advice]) => {
		if(advice && advisor){
			return res.status(200).json({userId:userId, adviceId:adviceId, message:"Deleted Successfully"});
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
  				
    		const investorId = user.investor; 
    		
    		return Promise.all([AdviceModel.updateFollowers({
    						_id: adviceId}, investorId),

						InvestorModel.updateFollowing({
			    			_id: investorId}, adviceId, "advice"
						    		)]);
			
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
            				portfolio: advice.portfolio});

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











