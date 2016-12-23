DEPLOY_ENV=$NODE_ENV
if [ -z "$DEPLOY_ENV" ]; then
	DEPLOY_ENV="staging"
fi
echo "Deploying in :: $DEPLOY_ENV"
docker build -t aqbackend_image -f dockerfiles/$DEPLOY_ENV .
docker rm -f aqbackend
docker run -p 3002:3002 -d --name aqbackend aqbackend_image
