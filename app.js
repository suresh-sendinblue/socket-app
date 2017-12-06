
  const express = require('express');
  const app = express();
  const async = require("async");
  const server = require('http').createServer(app);
  const io = require('socket.io')(server);
  const Docker = require('dockerode');
  const mongojs = require('mongojs');
  const db = mongojs('mongodb://localhost:27017/testingdb', ['loadtestiglogs'])
  const stream = require('stream');
  const docker = new Docker({socketPath: '/var/run/docker.sock'});
  const container = docker.getContainer('f1fabe61407b');
  var logStream = new stream.PassThrough();
  const MILLI = 1000;
  const SECOND = 5*MILLI;


app.use(express.static(__dirname + '/node_modules'));
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html');
});
io.on('connection', function(client) {
    console.log('Client connected...');
    client.on('join', function(data) {
        console.log(data);
    });
    // container.stats((err, stream) => {
    //   if(err){
    //     console.log('Error in opening connection', err);
    //     return process.exit(1);
    //   }
    //   stream.pipe(logStream);
    //   logStream.on('data', function(chunk){
    //     let data = chunk.toString('utf8');
    //     data = JSON.parse(data);
    //     data.ts = new Date().getTime();
    //     data = get_docker_stats(data);
    //     //db.loadtestiglogs.save(data);
    //     client.emit('room', data);
    //   });
    // });
    let counter = 0;
    async.forever((callback) => {
        db.loadtestiglogs.find({}).sort({ ts : -1}).skip(counter++ * 15000).limit(15000).toArray(function(err, items){
          if(err){
            return console.error(err);
          }
          console.log(items.length);
          client.emit('room', items);
          setTimeout(() => {
            //callback();
          }, 1000);
        });
    });
  });


  const calculate_cpu_percent = (cpu) => {
      let cpu_count = cpu["cpu_stats"]["cpu_usage"]["percpu_usage"].length;
      let cpu_percent = 0.0;
      let cpu_delta = parseFloat(cpu["cpu_stats"]["cpu_usage"]["total_usage"]) - parseFloat(cpu["precpu_stats"]["cpu_usage"]["total_usage"]);
      let system_delta = parseFloat(cpu["cpu_stats"]["system_cpu_usage"]) - parseFloat(cpu["precpu_stats"]["system_cpu_usage"]);
      if(system_delta > 0.0 && cpu_delta > 0.0){
          cpu_percent = (cpu_delta / system_delta) * 100.0 * cpu_count;
      }
      return cpu_percent;
  }

  const humanize_bytes = (bytesize, precision=2) => {
      const abbrevs = {
        'GB': 1 << 30,
        'MB': 1 << 20,
        'kB': 1 << 10,
        'bytes': 1
      };
      if( bytesize == 1) {
          return '1 byte';
      }
      var factor, suffix;
      for(suffix in abbrevs){
          factor = abbrevs[suffix];
          if(bytesize >= factor){
              break;
          }
      }
      if(factor == 1){
          precision = 0;
      }
      return round(bytesize / parseFloat(factor), precision) + " " + suffix;
  }

  const get_docker_stats = (x) => {
      let last_memory_post = 0
      let last_cpu_post = 0
      let cpu_p = calculate_cpu_percent(x)
      let m_usage = humanize_bytes(x['memory_stats']['usage'])
      let m_limit = humanize_bytes(x['memory_stats']['limit'])
      let percentage_m_usage = (x['memory_stats']['usage'] / x['memory_stats']['limit']) * 100
      //console.log("Cpu usage ", cpu_p, " %");
      //console.log("Memory Usage ", percentage_m_usage, " %");
      //console.log("Memory Usage ", m_usage);
      //console.log("Memory limit ", m_limit);
      //console.log("\n\n");
      return { cpu_p: cpu_p, percentage_m_usage: percentage_m_usage, m_usage: m_usage, m_limit: m_limit, ts: x.ts };
  }

  const round = (value, decimals) => {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
  }

  const calculateBlockIO = (blkio) => {
    let blkRead = 0, blkWrite = 0;
    for(let bioEntry in blkio.io_service_bytes_recursive){
      switch(bioEntry.op.toLowerCase()){
        case "read": blkRead = blkRead + bioEntry.value; break;
        case "write": blkRead = blkRead + bioEntry.value; break;
      }
    }
    return { blockRead: blkRead, blockWrite: blkWrite };
  }

  const calculateNetwork = (network) => {
      let rx, tx;
      for(let v in networks){
          rx += v.rx_bytes;
          tx += v.tx_bytes;
      }
      return { rx: rx, tx: tx };
  }


server.listen(4200);
