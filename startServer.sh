ENV="$1"
NODE_ENV="$ENV" forever stop index.js
ports="3001 3002 3003 3004 3005 3006"
if [ -z "$2" ]
  then
    echo "No ports supplied"
    echo "Defaulting: ${ports}"
else
    ports="$2"
fi

IFS=' ' read -a portsArray <<<"$ports"
echo "$pwd"
for index in "${!portsArray[@]}"
do
   # do whatever on $index
   port=${portsArray[$index]}
   NODE_ENV="$ENV" forever start -w --watchDirectory="$pwd" index.js $port
done
