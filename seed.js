var db = connect('localhost:27017/aimsquant_dev');

db.strategy.insert({
    name: 'Community',
    type: 'all',
    language: '',
    description: 'this is public strategies'
});
