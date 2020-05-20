import { $, $$, to24HourFormat, formatRangeLabel, toDateInputFormat } from './helpers.js';
import { center, hereCredentials, timeframe, stopovertime } from './config.js';
//Initialize HERE Map
const platform = new H.service.Platform({apikey: hereCredentials.apikey});
const defaultLayers = platform.createDefaultLayers();
const map = new H.Map(document.getElementById('map'), defaultLayers.vector.normal.map, {center, zoom: 12, pixelRatio: window.devicePixelRatio || 1});
const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
const provider = map.getBaseLayer().getProvider();
//Initialize route and geocoder
//const router = platform.getRoutingService();
const geocoder = platform.getGeocodingService(1);
//Initialize Ajax Object
const xhttp = new XMLHttpRequest();
//listen on window resize to resize map
window.addEventListener('resize', () => map.getViewPort().resize());
export { router, geocoder }
//Define a callback function to process the routing response:
var onResult = function(result) {
    //ensure that at least one route was found
    if(result.routes.length)
    {
        result.routes[0].sections.forEach((section) => {
            //Create a linestring to use as a point source for the route line
            let linestring = H.geo.LineString.fromFlexiblePolyline(section.polyline);            
            //Create a polyline to display the route:
            let routeLine = new H.map.Polyline(linestring, {
                style: { strokeColor: 'blue', lineWidth: 3 }
            });            
            //Create a marker fot the start point:
            let startMarker = new H.map.Marker(section.departure.place.location);          
            //Create a marker fot the end point:
            let endMarker = new H.map.Marker(section.arrival.place.location); 
            //Add the route polyline and the two marker to the map:
            map.addObjects([routeLine, startMarker, endMarker]);  
            //Set the maps's viewport to make the whole route visible:
            map.getViewModel().setLookAtData({bounds: routeLine.getBoundingBox()});
        });
    }
};

//Define a callback function to process Summary results
//used for calculation stop
var onResultSummary = function(result) {
    //Push total traveltime offset into sectionViaTimes Array
    sectionViaTimes[1].push([result.routes[0].sections[0].travelSummary.duration, result.routes[0].sections[1].travelSummary.duration])
    console.log(sectionViaTimes);
    //check if first stopover > ifso add eta to homebase.start homebase.finish
    if(waypoints.length == 1){
        waypoints.push([(result.routes[0].sections[0].arrival.place.location.lat + "," + result.routes[0].sections[0].arrival.place.location.lng), result.routes[0].sections[0].travelSummary.duration, -1]);
        //waypoints[1][1] = (result.routes[0].sections[0].travelSummary.duration); //departure time as minus | 0 = first costumer
        waypoints.push([homebase, (result.routes[0].sections[1].travelSummary.duration + stopovertime + waypoints[1][1]), -1])
        //waypoints[2][1] = (result.routes[0].sections[1].travelSummary.duration + stopovertime + waypoints[1][1]); //arrival time at home including stopover timeframe > see config    
        console.log(waypoints);
    }
}

//Get an instance of the routing service version 8:
var router = platform.getRoutingService(null, 8);
//Call calculateRoute() with the routing parameters,
//the callback and an error callback functiuon (called if a communication error occurs):
// variable that keeps the homebase coordinates
var homebase = '47.1756902,8.5302796';
// array containing all stops on route and corresponding time - starting with homebase
var waypoints = [[homebase, 0, -1]]; //[coordinates, eta, timeframe{positiv = desired timeframe; negativ = no timeframe}]
//var waypoints = [homebase, '47.1673423,8.5261573', '47.1655216,8.5237734', '47.1664326,8.5240735', '47.1649284,8.5121401', homebase];
//2d Array to store origins and corresponding offset time, used to calculate shortest d-tour 
var sectionViaTimes = [[],[]];


//Listen to focus out event on adress
$('#egal').addEventListener('click', function(evt){
    //fill Parameters for geolocation service
    var geocodeParameter = {
        'searchtext': $('#adr').value + ',6300,Zug'
    }
    //on ajax request return
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            if(this.responseText != '' && this.responseText != null){
                //Parse response
                let geoloc = JSON.parse(this.responseText);
                //check if return is 'eindeutig'
                if(geoloc.Response.View[0].Result[0].MatchLevel == "houseNumber"){
                    //extract latitude and Longitude
                    let latlo = geoloc.Response.View[0].Result[0].Location.NavigationPosition[0].Latitude + "," + geoloc.Response.View[0].Result[0].Location.NavigationPosition[0].Longitude;
                    //getPossibleRoutes
                    getRoute(latlo, true);
                } else if (geoloc.Response.View[0].Result[0].MatchLevel == "street"){
                    console.log("Bitte Adresse mit Hausnummer");
                } else if (geoloc.Response.View[0].Result[0].MatchLevel == "city"){
                    console.log("Bitte Strasse angeben");
                }
            }
        }
    };
    //open Ajax connection
    xhttp.open("GET", geocoder.geocode(geocodeParameter).data, true);
    //send Ajax request
    xhttp.send();
});

// listen to click on getPoly butten > get route and display it on map
$('#getPolyDom').addEventListener('click', function(evt){
    for(let i=0;i<waypoints.length-1;i++){
        hereGetRoutePolyline(waypoints[i][0], waypoints[i+1][0]);
    }
});
//Function to be called when address input looses focus
function getRoute(latlo, egal){
    //check if first stopover on route
    if(waypoints.length <= 1){
        if(egal){
            hereGetRouteSummary(homebase, latlo, homebase);
            /*waypoints.push([latlo,0,-1]); //push destination in
            waypoints.push([homebase,0,-1]); //push homebase for return  */
        }
    } else { //not the first stopover
        for(let i=0;i<=waypoints.length-2;i++){ //for every stopover in waypoints (-2: ignor homebase at the end) 
            hereGetRouteSummary(waypoints[i][0], latlo, waypoints[i+1][0]) //call function to call HERE API hereGetRouteSummary(origin, via, destination)
        }
        let min = 0; //index of shortest way
        setTimeout(function(){ //timeout to await callback from HERE API
            for(let i=0;i<(sectionViaTimes[1].length);i++){ //intariat through every entry in sectionViaTimes to find shortes route
                if(sectionViaTimes[1][i][0] + sectionViaTimes[1][i][1] < sectionViaTimes[1][min][0] + sectionViaTimes[1][min][1]){    //if time is shorter then current shortest time = overwrite shortest index
                    min = i;
                }
            }
            // Put coordinates in waypoints array (acording to shortes travel time as calculated above)
           //for(let i=1;)*/
            let y;
            //indexOf() sorta, workaround to find position in waypoint araray of shortest offset
            for(y=0;y<waypoints.length;y++){
                if(sectionViaTimes[0][min] == waypoints[0][y]) break;         
            }
            //calculate the eta from departure point to arrival point + stoovertime
            let eta = waypoints[y][1] + sectionViaTimes[1][min][0] + stopovertime;
            //put coordinates and eta in waypoints array at the correct position
            waypoints.splice(y+1,0,[latlo,waypoints[y][1] + eta, egal ? -1 : 0]);  
            //calculate the eta offset for all the following waypoints
            let etaoffset = eta + sectionViaTimes[1][min][1];
            //put them eta offsets in
            for(let i=y+2;i<waypoints.length;i++){
                waypoints[i][1] += etaoffset;        
            }
            console.log(waypoints);
        }, 300);    
    }
}
// function to call HERE API for routing, just get travelSummary
function hereGetRouteSummary(origin, via, destination){
    let routingParameters = {
            routingMode: 'fast',
            'transportMode': 'car',
            'origin': origin,
            'destination': destination,
            'via': via,
            'return': 'travelSummary'
        }
    // fill SectionViaTimes Array with origin coordinates
    sectionViaTimes[0].push(origin);
    //call HERE API
    router.calculateRoute(routingParameters, onResultSummary, function(error){ console.log(error.message); });   //console.log(error.message); });
}                    
//function to get Call HERE API, with polyline and summery, no via - used when no stopover exist
async function hereGetRoutePolyline(origin, destination){
     let routingParameters = {
            routingMode: 'fast',
            'transportMode': 'car',
            'origin': origin,
            'destination': destination,
            'return': 'polyline,travelSummary'
        }
     router.calculateRoute(routingParameters, onResult, function(error){ console.log(error.message); });
} 

//collabsebl
var coll = document.getElementsByClassName("collapsible");

for (let i = 0; i < coll.length; i++) {
  coll[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var content = this.nextElementSibling;
    if (content.style.maxHeight){
      content.style.maxHeight = null;
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
    } 
  });
}




