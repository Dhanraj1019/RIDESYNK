class ExpressError extends Error{
    constructor(status=500,message){
        super();
        this.status=status;
        this.message=message;
    }
}

module.exports=ExpressError;