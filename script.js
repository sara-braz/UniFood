fetch("http://172.16.0.36:3000/restaurants")
.then(res => res.json())
.then(data => {
    console.log(data)
})