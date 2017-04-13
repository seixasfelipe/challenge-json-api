Object.prototype.readPropertyCaseInsensitive = function (prop) {
    
    let result = undefined

    Object.keys(this).forEach(p => {
        if(p.toLowerCase() === prop) 
            result = p
    })


    return result
}