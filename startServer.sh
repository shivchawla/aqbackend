ENV="$1"
NODE_ENV="$ENV" pm2 stop index.js 
ports="3001 3002 3003 3004 3005 3006"
if [ -z "$2" ]
  then
    echo "No ports supplied"
    echo "Defaulting: ${ports}"
else
    ports="$2"
fi

IFS=' ' read -a portsArray <<<"$ports"
echo "$PWD"
echo "Hello"
for index in "${!portsArray[@]}"
do
	# do whatever on $index
	port=${portsArray[$index]}
    NODE_ENV="$ENV" pm2 start index.js --name  "API_${ENV}_${port}" --watch -- --port=${port} 
done