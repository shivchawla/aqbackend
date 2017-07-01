/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-06-30 15:57:45
*/

'use strict';
const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const AdviceModel = require('../models/advice');
const UserModel = require('../models/user');
const PortfolioModel = require('../models/portfolio');
const Promise = require('bluebird');
const config = require('config');
const HelperFunctions = require("./helpers");
const APIError = require('../utils/error');

function getDate(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getYear();

    return d+"-"+m+"-"+y;  
}

exports.createAdvice = function(args, res, next) {
	const userId = args.user._id;
	const advice = args.body.value;

	var advisorId = '';
	
	//Any one can create an advice
	AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'})
	.then(advisor => {
		if(advisor) {
			advisorId = advisor._id;
			return AdviceModel.fetchAdvices({advisor: advisorId},{fields:'_id'})
		}
	})
	.then(advices => {
		if(advices.length < config.get('max_advices_per_advisor')) {
			return HelperFunctions.validateAdvice(advice);
		} else {
			APIError.throwJsonError({advisorId: advisorId, message:"Cannot add more advices", errorCode: 5});
		}
	})
	.then(valid => {
		if(valid) {
			return PortfolioModel.savePortfolio(advice.portfolio);
		} else {
			APIError.throwJsonError({msg: "Invalid Portfolio Composition"});
		}
	})
	.then(port => {
		if(port) {
			const adv = {
				advisor: advisorId,
				benchmark: advice.benchmark, 
		       	portfolio: port._id, 
		       	createdDate: new Date(),
		       	updatedDate: new Date()   	
		    };
		    return AdviceModel.saveAdvice(adv);
	    } else {
	    	APIError.throwJsonError({userId: userId, message:"Invalid Portfolio: Create Advice"});
	    }
	})
    .then(advice => {
    	if(advice) {
    		//return res.status(200).json(advice);
			/*return Promise.all([advice, AdvisorModel.addAdvice({
        		_id: advisorId
			}, advice._id)]);
		} else {
			APIError.throwJsonError({message: "Advice not created"});
			//return res.status(400).json({message: "Invalid Portfolio"});
		}		
    })
    .then(([advice, advisor]) => {
    	if(advice && advisor) {*/
    		return res.status(200).json(advice);
    	} else {
    		APIError.throwJsonError({msg: "Advice not added to advisor"});	
    	}
    })
	.catch(err => {
		return res.status(400).send(err.message);
    });
};

exports.updateAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const user = args.user
	const newAdvice = args.body.value;
	
	Promise.all([AdviceModel.fetchAdvice({_id: adviceId, advisor: user.advisor}, {fields:'portfolio'}),
					HelperFunctions.validateAdvice(newAdvice)])
	.then(([advice, valid]) => {
		if(valid && advice) {
			return Promise.all([advice, PortfolioModel.clonePortfolio({_id: advice.portfolio})]);
		} else {
			if(!valid){
				APIError.throwJsonError({msg: "Invalid Portfolio Composition"});
			} else {
				APIError.throwJsonError({userId:userId, adviceId:adviceId, msg: "Advice not found"});
			}
		}
	})
	.then(([advice, clonePortfolio]) => {
		if(clonePortfolio) {
			newAdvice["history"] = clonePortfolio._id;	
			return PortfolioModel.updatePortfolio({_id: advice.portfolio}, newAdvice.portfolio);
		} else {
			APIError.throwJsonError({msg: "Advice portfolio can't be updated"});
		}
	})
	.then(portfolio => {
		newAdvice["portfolio"] = portfolio._id;
		return AdviceModel.updateAdvice({_id: adviceId}, newAdvice);
	})
	.then(advice => {
		return res.status(200).json(advice);
	})
    .catch(err => {
    	return res.status(400).json(err.message);
    });
};

exports.publishAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
};

exports.getAdvices = function(args, res, next) {
	const userId = args.user._id;
    
    const options = {};
	options.skip = args.skip.value;
    options.limit = args.limit.value;

    options.sort = args.sort.value;
    options.fields = 'name description performance createdDate updatedDate advisor public approved';

    const following = args.following.value;
    const subscribed = args.subscribed.value;
    const personal = args.personal.value;
    const approved = args.approved.value;

    const query = {deleted: false, public: true};

    
    if(approved) {
    	query.approved = approved;
    }
    
    Promise.all([AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
    		InvestorModel.fetchInvestor({user:userId}, {fields: '_id'})])
    .then(([advisor,investor]) => {
    	if (personal) {
	        query.advisor = advisor._id;
	        delete query.public;
	    } else if (following) {
	        query.followers = {'$elemMatch':{'$eq': investor._id}}
	    } else if(subscribed){
	        query.subscribers = {'$elemMatch':{'$eq': investor._id}}
	    }
    
    	return AdviceModel.fetchAdvices(query, options)
	})
    .then(advices => {
    	if(advices) {
    		return res.status(200).json(advices);
		} else {
			APIError.throwJsonError({message: "No advices found"});
		}

    	/*return Promise.all(advices.map(advice => {
				HelperFunctions.getUpdatedAdviceSummary(advice._id)};
			})
		);*/
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

exports.getAdviceSummary = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	
	const options = {};
	options.fields = 'name description benchmark advicePerformance createdDate updatedDate advisor public approved';
	
	Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'}),
	AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, options)])
 	.then(([advisor, advice]) => {
 		if(advice && advisor) {
 			const advisorId = advisor._id;
	 		if((!advisorId.equals(advice.advisor) && advice.public == true && advice.approved == true)  
	 			|| advisorId.equals(advice.advisor)) { 
	 			
	 			var update = false;
	 			if(options.fields.indexOf('advicePerformance')) {
		            //check if advice Performance is the latest
		            if(advice.advicePerformance) {
		                var performance = advice.advicePerformance;

		                if(performance.updatedDate) {
			                if(getDate(performance.updatedDate) < getDate(new Date())) {
			                    update = true;
			                }
		                } else {
		                	update = true; 
		                } 

		            } else {
		                update = true;
		            }
		        }

		        if(update) {
		             return Promise.all([true, HelperFunctions.calculatePerformanceAndUpdateAdvice(adviceId, options)]);
 				} else {
 					return [false, advice];
 				}
	 			
			} else {
				APIError.throwJsonError({userId: userId, adviceId: adviceId, message:"Not authorized to view this advice"});
			}
		} else {
			APIError.throwJsonError({message:'No advice found'});
		}
 	})
	.then(([updated, advice]) => {
		if (updated) {
			return AdviceModel.fetchAdvice({_id:adviceId}, options);
		} else {
			return advice;
		}
	})
	.then(finalAdvice => {
		return res.status(200).json(finalAdvice);
	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });    
};

exports.getAdviceDetail = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
   	options.fields = args.fields.value;

	Promise.all([InvestorModel.fetchInvestor({user: userId}, {fields:'_id'}),
				AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'}),
				AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor followers subscribers'})])
	.then(([investor, advisor, advice])  => {
		if(investor && advisor && advice) {
			const advisorId = advisor._id;
			const investorId = investor._id;

			//PERSONAL
			if (advice.advisor.equals(advisorId) || advice.subscribers.indexOf(investorId) != -1) {
				if(!options.fields) {
					options.fields = 'portfolio advicePerformance subscribers followers createdDate updatedDate approved advisor';
				}
			} else if(advice.followers.indexOf(investorId) != -1) {
				//if(!options.fields) {
					// Over ride fields as portfolio (and a few others) are NOT allowed
					options.fields = 'advicePerformance subscribers followers createdDate updatedDate advisor';
				//} 
			}

			var update = false;
 			if(options.fields.indexOf('advicePerformance')) {
	            //check if advice Performance is the latest
	            if(advice.advicePerformance) {
	                var performance = advice.advicePerformance;

	                if(performance.updatedDate) {
		                if(getDate(performance.updatedDate) < getDate(new Date())) {
		                    update = true;
		                }
	                } else {
	                	update = true; 
	                } 

	            } else {
	                update = true;
	            }
	        }

	        if(update) {
	             return Promise.all([true, HelperFunctions.calculatePerformanceAndAdviceUpdate(adviceId)]);
			} else {
				return [false, advice];
			}

			//return AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, options); 
		} else {
			if(!investor) {
				APIError.throwJsonError({message:"Investor not found"});
			} else if(!advisor) {
				APIError.throwJsonError({message:"Advisor not found"});
			} else if (!advice) {
				APIError.throwJsonError({message:"Advice not found or already deleted"});
			}
		}
	})
	.then(([updated, advice]) => {
		if (updated) {
			return AdviceModel.fetchAdvice({_id:adviceId}, options);
		} else {
			return advice;
		}
	})
	.then(finalAdvice => {
		return res.status(200).json(finalAdvice);
	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });
};

/*exports.getAdvice = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    options.fields = args.fields.value;

    if (!options.fields) {
    	options.fields = 'advisor portfolioHistory portfolio portfolioStats performanceMetrics createdDate updatedDate approved';
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

  			if (options.fields.indexOf('performanceMetrics') != -1 || options.fields.indexOf('portfolio') != -1) {
  				
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

/*exports.updateAdvicePortfolio = function(args, res, next) {
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
				return AdviceModel.getAdvice({_id: adviceId}, 'portfolio')
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
					HelperFunctions.updatePortfolio({_id: advice.portfolio}, transactions)]);	
	})
	.then(([updated, portfolio]) => {
		if(portfolio) {
			PortfolioModel.addTransactions({_id: portfolio}, {transactions: transactions})
		}
	})
	.catch(err => {
        res.status(400).send(err.message);
        //next(err);
    });
};*/

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
    	return res.status(400).send(err.message);
    });
};

exports.deleteAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	
	AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'})
	.then(advisor => {
		if(advisor) {
			//return //Promise.all([AdvisorModel.removeAdvice({_id: advisorId}, adviceId),
			 return AdviceModel.deleteAdvice({_id: adviceId, advisor: advisor._id});//]);
		} else {
			APIError.throwJsonError({userId: userId, message:"Not authorized"}); 
		}
	})
	.then(advice => {
		if(advice) {
			return res.status(200).send({adviceId:adviceId, msg:"Advice deleted"});
		}
	})
  	.catch(err => {
  		return res.status(400).send(err.message);
    });
};

exports.followAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	Promise.all([UserModel.fetchUser({_id: userId}), 
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true}, {})])
  	.then(([user, advice]) => {
  		if(user && advice) {			
    		const investorId = user.investor; 
    		
    		return Promise.all([AdviceModel.updateFollowers({
    						_id: adviceId}, investorId),

						InvestorModel.updateFollowing({
			    			_id: investorId}, adviceId, "advice"
						    		)]);
			
		} else {
			if(!user) {
				APIError.throwJsonError({userId: userId, message: "User not found"});
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found"});
			}
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({followers:advice.followers, count: advice.followers.length}); 
		} else if(!investor) {
			APIError.throwJsonError({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			APIError.throwJsonError({adviceId: adviceId, message: "No Advice found"});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

exports.subscribeAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	Promise.all([UserModel.fetchUser({_id: userId}), 
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true}, {})])
  	.then(([user, advice]) => {
  		if(user && advice) {
  				
    		const investorId = user.investor; 
    		
    		return Promise.all([AdviceModel.updateSubscribers({
    						_id: adviceId}, investorId),

						InvestorModel.updateSubscription({
			    			_id: investorId}, adviceId
						    		)]);
		} else {
			if(!user) {
				APIError.throwJsonError({userId: userId, message: "User not found"});	
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found"});	
			}
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({userId: userId, adviceId: adviceId, message: "Subscribed updated successfully"}); 
		} else if(!investor) {
			APIError.throwJsonError({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			APIError.throwJsonError({adviceId: adviceId, message: "No Advice found"});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
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












