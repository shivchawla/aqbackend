NODE_ENV='staging' forever stop index.js

set -- "${1:-3001 3002 3003 3004 3005 3006}"
ports="$1"
IFS=' ' read -a portsArray <<<"$ports"

for index in "${!portsArray[@]}"
do
   # do whatever on $index
   port=${portsArray[$index]}
   NODE_ENV='staging' forever start index.js $port
done

