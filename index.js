const fs = require("fs");
const http = require("http");
const https = require("https");

const { holiday_apikey, giphy_apikey } = require("./auth/credentials.json");
const port = 3000;
const server = http.createServer();
server.on("listening", listen_handler);
server.listen(port);
function listen_handler() {
    console.log(`Now Listening on Port ${port}`);
}
server.on("request", request_handler);

const cache_file = './cache/BD_holiday_data.json';

function request_handler(req, res) {
    // get new request from the ip address for a particular resource
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);

    // if the resource is the root of the site, send back the index file
    if (req.url === "/") {
        const form = fs.createReadStream("html/index.html");
        res.writeHead(200, { "Content-Type": "text/html" })
        form.pipe(res);
    }

    else if (req.url.startsWith("/search")) {
        // the data that gets passed in is a url params object, which is a hashmap
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;

        // from the url, value of the day gets extracted
        let day_of_week = user_input.get('day');

        // does the cache exist?
        if (fs.existsSync(cache_file)) {
            cache_object = require(cache_file);
            if (new Date(cache_object.ttl) > Date.now()) {
                console.log("using valid cache data");
                // the holiday data that exists gets utilized
                parse_results(cache_object, day_of_week, res);
            }
        } else {
            // retrieve the current date
            const query_time = new Date();

            console.log("call holiday API");
            // query the holiday for the specific country and date
            const holiday_data = https.request(`https://holidayapi.com/v1/holidays?country=BD&year=2021&key=${holiday_apikey}`);

            // takes a stream and converts it to string one chunk at a time, attaches it to a body
            holiday_data.on("response", stream =>
                process_stream(stream, h_results, query_time, day_of_week, res));  // when there's no more data, we get an event that calls the callback that's the 2nd parameter 

            holiday_data.end();
        }
    }
    else {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end(`<h1>404 Not Found</h1>`);
    }
}

function h_results(data, query_time, day_of_week, res) {
    const h_result_object = JSON.parse(data); // converts a json string into an object
    // the time to live (ttl) date of the data gets set to one hour.
    h_result_object.ttl = new Date(query_time.getTime() + 3600000);
    fs.writeFile('./cache/BD_holiday_data.json', JSON.stringify(h_result_object, null, 4), () => console.log("created cache file and inserted holiday data"));
    parse_results(h_result_object, day_of_week, res);
}

function parse_results(jData, day_of_week, res) {
    // error checking 
    if (day_of_week == null || day_of_week == "") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end(`<center><h1>Missing input</h1>
        <img src="https://media3.giphy.com/media/FvLq3vP4eOjxhdTmTA/giphy.gif?cid=790b7611e1853785f307613923807b9d33200fc39426104a&rid=giphy.gif&ct=g">
        </center>`);
    } else if (day_of_week < 1 || day_of_week > 7 || isNaN(day_of_week)) {
        res.writeHead(404, { "Content-Type": "text/html" })
        res.end(`<center><h1>${day_of_week}th Day of The Week Does Not Exist!</h1>
        <img src="https://media3.giphy.com/media/wRwPiWQFz8dEV58TEI/giphy.gif?cid=790b7611a25f930a046f4e0a1a7ac23c57afc620fdc1edf3&rid=giphy.gif&ct=g">
        </center>`);
    }

    let len = jData.holidays?.length;
    for (let h = 0; h < len; h++) {
        // optional chaining; even if one of these is undefined or null, then it will stop parsing the rest
        if (jData.holidays[h]?.weekday?.date?.numeric === day_of_week && jData.holidays[h].public) {
            // if the numeric value of the day matches to the day picked by the user
            // and if it is a public holiday
            let holiday_name = jData.holidays[h].name; // we get the name of the holiday
            findHolidayGif(res, holiday_name);
            return;
        }
    }
}

function findHolidayGif(res, holiday_name) {
    // gifs based on the holiday name are retrieved
    let giphy = https.request(`https://api.giphy.com/v1/gifs/search?q=Bangladesh ${holiday_name}&limit=1&api_key=${giphy_apikey}`);

    giphy.on("response", stream => process_stream(stream, parse_g_display, holiday_name, res));
    giphy.end();
}

function process_stream(stream, callback, ...args) {
    let body = "";
    // we have an empty string essentially, and anytime we get a data event, we add that chunk of data to the body
    stream.on("data", chunk => body += chunk);
    stream.on("end", () => callback(body, ...args)); // we pass into the callback, the combined string body which is h_results, then parse_g_display
}

function parse_g_display(data, holiday_name, res) {
    const gif_object = JSON.parse(data);
    let display;
    if (gif_object.data?.length === 0) {
        display = `<h1>No ${holiday_name} Found!</h1>`;
    } else {
        // gif setup
        let gif_source = gif_object.data[0]?.images.original.url;
        let gif_height = gif_object.data[0].images.original.height;
        let gif_width = gif_object.data[0].images.original.width;

        display = `<h1>${holiday_name}</h1><img src=${gif_source} width=${gif_width} height=${gif_height}>`
    }

    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(`<center>${display}</center>`);
}

