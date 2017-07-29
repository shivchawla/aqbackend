# node-jupyter

node-jupyter helps you in running jupyter notebook app for multi-users simultaneously.

## Build Steps

### Usage (no Jail)

 - Run `node index_nojail.js` and the app will be listening on port 8000.

### Usage (with Jail)

- For default build, execute `automate.sh` (in scripts dir). If there are no errors generated then you're good to go

- For manual build, follow these steps

1. Copy the julia executable to /opt/julia/


2. Rebase julia package directory to some common accessible directory like /opt/julia but make sure your julia package directory has write permissions

a. Run the following command in shell `export JULIA_PKGDIR=/opt/julia` 
b. In Julia, build the new package system by `Pkg.init()`
c. Copy the REQUIRE file from old package directory to the new one
d. Run `Pkg.resolve()`


3. Setting up Julia kernel for jupyter notebook

a. Copy the contents from /julia_kernel/, to /usr/local/share/jupyter/kernels/julia-0.5


4. Setting up the user jail environment

a. In group.sh, change the group name (the jail in which all users will reside) or otherwise leave it default, jail.
b. Run group.sh to add the group and set the necessary file permisions
c. In user.sh, change the user name, to whatever new user you want to add
d. Run user.sh to add the new user and put him into the jail group


5. Running the jupyter app from the newly added user account

a. Run `su username -c 'jupyter-notebook --notebook-dir=/home/username --no-browser'`

 - After installation is completed, run `node index.js` with root privileges.


## Details

Further details can be found as comments in each individual file. For any other queries, reach me at kishlaya.j@gmail.com
