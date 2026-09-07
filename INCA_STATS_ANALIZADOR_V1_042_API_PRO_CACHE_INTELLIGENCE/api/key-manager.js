const KEYS = [
 process.env.API_FOOTBALL_KEY_01,
 process.env.API_FOOTBALL_KEY_02,
 process.env.API_FOOTBALL_KEY_03,
 process.env.API_FOOTBALL_KEY_04,
 process.env.API_FOOTBALL_KEY_05,
 process.env.API_FOOTBALL_KEY_06,
 process.env.API_FOOTBALL_KEY_07,
 process.env.API_FOOTBALL_KEY_08,
 process.env.API_FOOTBALL_KEY_09
].filter(Boolean);

let index = 0;

function getKey(){
 if(!KEYS.length) throw new Error("NO_API_KEYS");

 const key = KEYS[index];

 index++;

 if(index >= KEYS.length){
   index = 0;
 }

 return key;
}

module.exports={getKey};