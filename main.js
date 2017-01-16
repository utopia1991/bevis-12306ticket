var https = require('https');
var fs = require('fs');
var ca = fs.readFileSync('./cert/srca.cer.pem');
var nodemailer = require('nodemailer');
var schedule = require('node-schedule');
var scanf = require('scanf');
var program = require('commander');
var config = {};

program
	.version('0.0.1')
	.option('-r', 'rewrite config')
	.parse(process.argv);

fs.readFile('config.json','utf-8',function(err,data){
	if(err||!data||program.rewrite){
		console.log('输入日期-time(如:2017-01-27)：');
		config.time = scanf('%s');

		console.log('输入始发站-from_station(如:SNH)：');
		config.from_station = scanf('%s');

		console.log('输入终点站-end_station(如:SRG)：');
		config.end_station = scanf('%s');

		console.log('输入车次-train_num(如:K1209，多个车次用|分开)：');
		config.train_num = scanf('%s').split('|');

		console.log('输入发件人邮箱-你自己的邮箱(如:123456789@163.com)：');
		config.your_mail = scanf('%s');

		console.log('输入密码：');
		config.mail_pass = scanf('%s');

		console.log('是否购买学生票?(y/n)：');
		config.ticket_type = scanf('%s')=='y'?'0X00':'ADULT';

		console.log('输入收件人邮箱(如果与上面的邮箱一致请会车)：');
		config.receive_mail = scanf('%s');

		fs.writeFile('config.json',JSON.stringify(config));
	} else {
		config = JSON.parse(data);
	}
	var rule = new schedule.RecurrenceRule();
	rule.second = [0];
	schedule.scheduleJob(rule, function(){
		queryTickets(config);
			console.log('检索开始:' + new Date());
	});
});

var ze_temp = [], wz_temp = [], zy_temp = [];  //保存余票状态

function queryTickets(config){
	var options = {
		hostname: 'kyfw.12306.cn',  //12306
		path: '/otn/leftTicket/queryA?leftTicketDTO.train_date='+config.time+'&leftTicketDTO.from_station='+config.from_station+'&leftTicketDTO.to_station='+config.end_station+'&purpose_codes='+config.ticket_type,
		ca:[ca]                     //证书
	};

	var req = https.get(options, function(res){
		var data = '';
		var transporter = nodemailer.createTransport({
			host: "smtp.163.com",     //邮箱的服务器地址，如果你要换其他类型邮箱（如QQ）的话，你要去找他们对应的服务器，
			secureConnection: true,
			port: 25,                 //端口，这些都是163给定的，自己到网上查163邮箱的服务器信息
			auth: {
				user: config.your_mail, //邮箱账号
				pass: config.mail_pass, //邮箱密码
			}
	});

	res.on('data',function(buff){
		data += buff;   //查询结果（JSON格式）
	});

	res.on('end',function(){
		var jsonData = JSON.parse(data).data;

		// console.log('data:', jsonData);

		if(!jsonData||jsonData.length == 0){
			console.log('没有查询到余票信息');
			return;
		}

		var jsonMap = {};

		for(var i = 0; i<jsonData.length; i++){
			var cur = jsonData[i];
			jsonMap[cur.queryLeftNewDTO.station_train_code] = cur.queryLeftNewDTO;
		}

		var train_arr = config.train_num;                //查询的车次

		for(var j = 0; j < train_arr.length; j++){
				var cur_train = jsonMap[train_arr[j]];

				if(!cur_train){
					console.log('当天没有'+train_arr[j]+'这趟车次');
					continue;
				}

				var zy = cur_train.zy_num;                    //一等座数目
				var ze = cur_train.ze_num;                    //二等座数目
				var wz = cur_train.wz_num;                    //无座数目
				var trainNum = cur_train.station_train_code;  //车次

				console.log(trainNum + ' 一等座:',zy + ' 二等座:',ze + ' 无座:',wz);

				if(ze!='无' && ze!='--' || wz!='无' && wz!='--' || zy!='无' && zy!='--'){
					if(wz_temp[j] == wz && ze_temp[j] == ze && zy_temp[j] == zy){  //当余票状态发生改变的时候就不发送邮件
						console.log(trainNum + '状态没改变，不重复发邮件');
						continue;
					}

					var mailOptions = {
						from: config.your_mail,                             // 发件邮箱地址
						to: config.receive_mail || config.your_mail,        // 收件邮箱地址和发件邮箱一样
						subject: trainNum + '有票啦，二等座：'+ ze +'，无座：' + wz +'，一等座：' + zy,  // 邮件标题
						text:
							trainNum
							+ '\n'
							+ '二等座：' + ze + '，无座：' + wz + '，一等座：' + zy
							+ '\n'
							+ '时间是' + cur_train.start_train_date
							+ '\n'
							+ '出发时间：' + cur_train.start_time
							+ '\n'
							+ '到达时间：' + cur_train.arrive_time
							+ '\n'
							+ '历时：' + cur_train.lishi
							+ '\n'
							+ '始发站：' + cur_train.from_station_name
							+ '\n'
							+ '到达站：' + cur_train.to_station_name          // 邮件内容
					};

					// 发邮件
					(function(j,ze,wz,zy){
						transporter.sendMail(mailOptions, function(error, info){
							if(error){
								return console.log(error);
							}
							console.log('邮件已发送：' + info.response);
							wz_temp[j] = wz;   //保存当前列车的余票数量
							ze_temp[j] = ze;
							zy_temp[j] = zy;
						});
					})(j,ze,wz,zy);
				} else {
					console.log(trainNum + '二等座／站票／一等座无票');
				}
			}
		})
	});

	req.on('error', function(err){
		console.error(err.code);
	});
}
