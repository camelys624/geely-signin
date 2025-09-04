/*
吉利汽车签到 - Node.js版本
2024-06-22 - 2025-08-23
适配Node.js环境，移除Quantumult-X依赖

环境变量配置:
单个账户:
geely_val={"token":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx","devicesn":"XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"}

多个账户:
geely_val=[{"token":"token1","devicesn":"device1","name":"账户1"},{"token":"token2","devicesn":"device2","name":"账户2"}]

使用方法:
1. 设置环境变量 geely_val 或创建 .env 文件
2. 运行: node geely-node.js
*/

// 加载.env文件中的环境变量
require('dotenv').config();

const crypto = require('crypto-js');
const path = require('path');

class GeelyApp {
    constructor(config) {
        this.name = "吉利汽车签到";
        this.messages = [];
        this.dataFile = path.join(__dirname, 'geely_data.json');
        if (config) {
            this.config = config;
            this.token = config.token;
            this.devicesn = config.devicesn;
            this.accountName = config.name || config.token.slice(-6);
        }
    }


    log(message) {
        const prefix = this.accountName ? `[${this.accountName}]` : '';
        console.log(`[${new Date().toLocaleString()}] ${prefix} ${message}`);
    }

    pushMsg(message) {
        this.messages.push(message);
        this.log(message);
    }

    async httpRequest(options) {
        const https = require('https');
        const http = require('http');
        
        return new Promise((resolve, reject) => {
            const url = new URL(options.url);
            const client = url.protocol === 'https:' ? https : http;
            
            const requestOptions = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: options.body ? 'POST' : 'GET',
                headers: options.headers || {}
            };

            if (options.body) {
                requestOptions.headers['Content-Type'] = 'application/json';
                requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
            }

            const req = client.request(requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    } catch (e) {
                        resolve({code: 'error', message: 'JSON解析失败', data: data});
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('请求超时'));
            });

            if (options.body) {
                req.write(options.body);
            }
            req.end();
        });
    }

    async getAppVersion() {
        try {
            const result = await this.httpRequest({
                url: 'https://itunes.apple.com/cn/lookup?id=1518762715'
            });
            const version = result?.results?.[0]?.version || '3.28.0';
            this.log(`最新版本号：${version}`);
            return version;
        } catch (e) {
            this.log(`获取版本号失败，使用默认版本: ${e.message}`);
            return '3.28.0';
        }
    }

    generateSign(params) {
        const signStr = `${params}0]3K@'9MK+6Jf`;
        return crypto.MD5(signStr).toString();
    }

    async signIn() {
        const ts = Math.floor(Date.now() / 1000);
        const cId = "BLqo2nmmoPgGuJtFDWlUjRI2b1b";
        const body = JSON.stringify({cId, ts: ts.toString()});
        const signParams = `cId=${cId}&ts=${ts}`;
        const sign = this.generateSign(signParams);

        const sweetSecurityInfo = {
            appVersion: this.appVersion,
            deviceUUID: this.devicesn,
            geelyDeviceId: this.devicesn,
            brand: "Apple",
            osVersion: "17.6.1",
            networkType: "NETWORK_WIFI",
            battery: "100",
            os: "iOS",
            isCharging: "4",
            isSetProxy: "false",
            isLBSEnabled: "false",
            ip: "192.168.1.1",
            platform: "ios",
            screenResolution: "1290 * 2796",
            os_version: "17.6.1",
            model: "iPhone 15 Pro Max",
            isUsingVpn: "false",
            isJailbreak: "false"
        };

        const headers = {
            "X-Data-Sign": sign,
            "appVersion": this.appVersion,
            "deviceSN": this.devicesn,
            "sweet_security_info": JSON.stringify(sweetSecurityInfo),
            "token": this.token,
            "platform": "iOS",
            "User-Agent": `GLMainProject/${this.appVersion} (iPhone; iOS 17.6.1; Scale/2.00)`,
            "Content-Type": "application/json"
        };

        try {
            const result = await this.httpRequest({
                url: 'https://app.geely.com/api/v1/userSign/sign/risk',
                body,
                headers
            });

            const message = `签到：${result.message}`;
            this.pushMsg(message);
            
            // 改进错误检测
            if (result.code === 'fail' && result.message && result.message.includes('token')) {
                throw new Error(`Token错误: ${result.message}`);
            }
            
            return result.code;
        } catch (error) {
            this.pushMsg(`签到失败：${error.message}`);
            throw error;
        }
    }

    async getSignMsg() {
        const now = new Date();
        const body = JSON.stringify({
            year: now.getFullYear().toString(),
            month: (now.getMonth() + 1).toString()
        });

        const headers = {
            "token": this.token,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148/ios/geelyApp"
        };

        try {
            const result = await this.httpRequest({
                url: 'https://app.geely.com/api/v1/userSign/getSignMsg',
                body,
                headers
            });

            if (result.code === 'success') {
                const message = `累计签到：${result.data?.continuousSignDay}天`;
                this.pushMsg(message);
            }
        } catch (error) {
            this.pushMsg(`获取签到信息失败：${error.message}`);
        }
    }

    async summary() {
        const headers = {
            "appVersion": this.appVersion,
            "deviceSN": this.devicesn,
            "token": this.token,
            "platform": "iOS",
            "User-Agent": `GLMainProject/${this.appVersion} (iPhone; iOS 17.6.1; Scale/2.00)`
        };

        try {
            const result = await this.httpRequest({
                url: 'https://app.geely.com/api/v1/growthSystem/energyBody/summary',
                headers
            });

            if (result.code === 'success') {
                const total = parseFloat(result.data?.total || 0);
                const message = `能量体：${total}`;
                this.pushMsg(message);
            }
        } catch (error) {
            this.pushMsg(`获取能量体信息失败：${error.message}`);
        }
    }

    async run() {
        try {
            this.log(`🚀 开始执行签到`);
            
            this.appVersion = await this.getAppVersion();
            
            await this.signIn();
            
            await this.getSignMsg();
            
            await this.summary();
            
            this.log(`✅ 签到执行完成`);
            return this.messages;
            
        } catch (error) {
            this.log(`❌ 执行失败: ${error.message}`);
            throw error;
        }
    }
}

// 多账户运行函数
async function runMultipleAccounts() {
    const geelyVal = process.env.geely_val;
    if (!geelyVal) {
        console.error('❌ 请设置环境变量 geely_val');
        process.exit(1);
    }

    let configs;
    try {
        const parsed = JSON.parse(geelyVal);
        
        if (Array.isArray(parsed)) {
            configs = parsed;
        } else {
            configs = [parsed];
        }
    } catch (e) {
        console.error(`❌ 配置解析失败: ${e.message}`);
        process.exit(1);
    }

    console.log(`🚀 开始执行吉利汽车签到，共 ${configs.length} 个账户`);
    
    const allResults = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        
        if (!config.token || !config.devicesn) {
            console.error(`❌ 账户 ${i + 1} 配置格式错误：缺少token或devicesn`);
            failCount++;
            continue;
        }

        console.log(`\n📱 开始处理账户 ${config.name || `账户${i + 1}`}`);
        
        try {
            const app = new GeelyApp(config);
            const messages = await app.run();
            allResults.push(...messages);
            successCount++;
            
            if (i < configs.length - 1) {
                console.log('⏰ 等待 3 秒后处理下一个账户...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            console.error(`❌ 账户 ${config.name || `账户${i + 1}`} 签到失败: ${error.message}`);
            failCount++;
        }
    }

    console.log(`\n📋 签到总结:`);
    console.log(`✅ 成功: ${successCount} 个账户`);
    console.log(`❌ 失败: ${failCount} 个账户`);
    console.log(`📝 详细结果:\n${allResults.join('\n')}`);
    
    if (failCount > 0) {
        process.exit(1);
    }
}

// 主程序入口
if (require.main === module) {
    runMultipleAccounts().catch(error => {
        console.error(`程序异常退出: ${error.message}`);
        process.exit(1);
    });
}

module.exports = GeelyApp;