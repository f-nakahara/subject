var request = require("request-promise");
var sleep = require("sleep");
var fs = require("fs");
var csv = require("csv");
var iconv = require("iconv-lite");
var util = require("util");
var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kadai-info-c1a6c.firebaseio.com/"
});


// syllabusの中身を表示する
function printSyllabus(syllabus) {
    console.log(util.inspect(syllabus, false, null));
}

// post通信に使用するoptionsを生成する
function createRequestOptions(facultyId, startPeriod) {
    var data = {
        "cur_syz": facultyId["syz"],
        "MY_F": "/var/www/html/ac_syllabus/" + facultyId["faculty"],
        "NEXT_JIGEN": startPeriod,
        "SEARCH_ls[1]": "NO",
        "SEARCH_ls[2]": "NO",
        "SEARCH_ls[3]": "NO",
        "SEARCH_ls[4]": "NO",
        "SEARCH_ls[5]": "NO",
        "SEARCH_ls[6]": "NO",
        "SEARCH_ls[7]": "NO",
        "SEARCH_ls[8]": "NO",
        "SEARCH_ls[9]": "NO",
        // "PRES_st[16]": "10"  // 前期10 後期20
    };
    var options = {
        uri: "https://sb" + facultyId["sbId"] + ".kuas.kagoshima-u.ac.jp/ac_syllabus/free_time_table.php",
        headers: {
            "Content-type": "application/x-www-form-urlencoded",
        },
        form: data
    };
    return options;
}

// syllabusの初期化・初期設定を行う
function initSyllabus(days, periods) {
    var syllabus = {};
    for (var day of days) {
        if (!syllabus[day])
            syllabus[day] = {};
        for (var period of periods) {
            if (!syllabus[day][period])
                syllabus[day][period] = {};
        }
    }
    return syllabus;
}

// syllabusを取得する
function getSyllabus(syllabusTimetable, startPeriod, days, periods, syllabus) {
    for (var i = 0; i < syllabusTimetable.length; i++) {
        var day = days[i % 7];
        var period = periods[parseInt(i / 7 + parseInt(startPeriod)) - 1];
        var subjects = syllabusTimetable[i].split("<TR>");
        subjects = subjects.slice(1, subjects.length)
        for (var subject of subjects) {
            if (subject.match(/title=/)) {
                var split_contents = subject.split("title=")[2].split(">")[1].split("<")[0].split("（")
                var name = (split_contents.length == 2) ? split_contents[0] : split_contents[0] + "（" + split_contents[1];
                if (name.match(/▲/))
                    name = name.split("▲")[1];
                else if (name.match(/▼/))
                    name = name.split("▼")[1];
                var teacher = "";
                if (subject.split("title=")[2].split(">")[1].split("<")[0].split("（").length >= 2)
                    teacher = (split_contents.length == 2) ? split_contents[1].split("）")[0] : split_contents[2].split("）")[0];
                if (syllabus[day][period][name]) {
                    syllabus[day][period][name]["teacher"] = "";
                    syllabus[day][period][name]["many"] = true;
                }
                else {
                    syllabus[day][period][name] = {};
                    syllabus[day][period][name]["imp_period"] = "";
                    syllabus[day][period][name]["section"] = "";
                    syllabus[day][period][name]["school_year"] = "";
                    syllabus[day][period][name]["department"] = "";
                    syllabus[day][period][name]["teacher"] = teacher;
                    syllabus[day][period][name]["credit"] = "";
                    syllabus[day][period][name]["evaluation"] = "";
                    syllabus[day][period][name]["many"] = false;
                }
                if (subject.match(/<TD>/)) {
                    if (subject.split("<TD>").length >= 4) {
                        var room = hankaku2Zenkaku(subject.split("<TD>")[3].split("</TD>")[0]);
                        if (room == "")
                            room = "";
                        var lastIndex = syllabus[day][period].length - 1;
                        syllabus[day][period][name]["room"] = room;
                        if (syllabus[day][period][name]["many"])
                            syllabus[day][period][name]["room"] = "";
                    }
                }
            }
        }
    }
    return syllabus;
}

// シラバスの時間割枠のみ取得する
function getSyllabusTimetable(body, facultyId, startPeriod) {
    if (startPeriod == "1") {
        switch (facultyId["faculty"]) {
            case "_rikougaku": return body.split("LETTER_STAND_BK").slice(9, 23);
            case "_houbun": return body.split("LETTER_STAND_BK").slice(8, 22);
            case "_kyouiku": return body.split("LETTER_STAND_BK").slice(8, 22);
            case "_kyoutu": return body.split("LETTER_STAND_BK").slice(8, 22);
            case "_jyuui": return body.split("LETTER_STAND_BK").slice(8, 22);
            case "_ishigaku": return body.split("LETTER_STAND_BK").slice(8, 22);
        }
    }
    else if (startPeriod == "3") {
        switch (facultyId["faculty"]) {
            case "_rikougaku": return body.split("LETTER_STAND_BK").slice(9, 23 + 7);
            case "_houbun": return body.split("LETTER_STAND_BK").slice(8, 22 + 7);
            case "_kyouiku": return body.split("LETTER_STAND_BK").slice(8, 22 + 7);
            case "_kyoutu": return body.split("LETTER_STAND_BK").slice(8, 22 + 7);
            case "_jyuui": return body.split("LETTER_STAND_BK").slice(8, 22 + 7);
            case "_ishigaku": return body.split("LETTER_STAND_BK").slice(8, 22 + 7);
        }
    }
}

// 英数字を全角から半角に変換する
function hankaku2Zenkaku(str) {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
}

// 期を学年に変換
function getSchoolYear(school_year) {
    if (school_year.match(/1/) || school_year.match(/2/))
        return "1";
    else if (school_year.match(/3/) || school_year.match(/4/))
        return "2";
    else if (school_year.match(/5/) || school_year.match(/6/))
        return "3";
    else if (school_year.match(/7/) || school_year.match(/8/))
        return "4";
    return "";
}

// シラバスのCSVデータをJSONに変換して返す
async function readSyllabusFile(facultyId) {
    var faculty = facultyId["faculty"];
    if (facultyId["syz"] == "5310")
        faculty = "_rikougaku_in";
    else if (facultyId["syz"] == "5110")
        faculty = "_kyouiku_in";
    var csv = require("csv-parse/lib/sync");
    var data = fs.readFileSync("./syllabus/2020/" + faculty + ".csv");
    var res = await csv(iconv.decode(data, "SJIS"), { columns: true });
    return res;
}

// 共通、工、法文、教育、獣医
// 講義名、教室、担当
async function fuckGomiSyllabus() {
    var days = ["日", "月", "火", "水", "木", "金", "土"];
    var periods = ["1", "2", "3", "4", "5"];
    var startPeriods = ["1", "3"];
    var facultyIds = {
        "共通": {
            "faculty": "_kyoutu", "syz": "5800", "sbId": "06"
        },
        "工": {
            "faculty": "_rikougaku", "syz": "2500", "sbId": "02"
        },
        "法文": {
            "faculty": "_houbun", "syz": "1300", "sbId": "04"
        },
        "教育": {
            "faculty": "_kyouiku", "syz": "0700", "sbId": "07"
        },
        "歯": {
            "faculty": "_ishigaku", "syz": "1f00", "sbId": "05"
        },
        "獣医": {
            "faculty": "_jyuui", "syz": "1a00", "sbId": "05"
        },
        "理工（院）": {
            "faculty": "_rikougaku", "syz": "5310", "sbId": "02"
        },
        "教育（院）": {
            "faculty": "_kyouiku", "syz": "5110", "sbId": "07"
        },
    };

    for (var facultyName in facultyIds) {
        var facultyId = await facultyIds[facultyName];
        var syllabus = initSyllabus(days, periods);
        for (var startPeriod of startPeriods) {
            var options = createRequestOptions(facultyId, startPeriod);
            await request.post(options)
                .then(async (body) => {
                    var syllabusTimetable = await getSyllabusTimetable(body, facultyId, startPeriod);
                    syllabus = await getSyllabus(syllabusTimetable, startPeriod, days, periods, syllabus);
                    printSyllabus(syllabus);
                });
            sleep.sleep(1);  // アクセス間隔を空ける
        }
        var syllabusFiles = await readSyllabusFile(facultyId);
        for (var day in syllabus) {
            for (var period in syllabus[day]) {
                for (var name in syllabus[day][period]) {
                    var subject = syllabus[day][period][name];
                    var finded = false;
                    for (var j = 0; j < syllabusFiles.length; j++) {
                        var syllabusFile = await syllabusFiles[j];
                        if (syllabusFile["■科目名"] == name) {
                            finded = true;
                            var department = await hankaku2Zenkaku(syllabusFile["■対象学科名"]);
                            var imp_period = await hankaku2Zenkaku(syllabusFile["■前後期"]);
                            var section = (facultyId["faculty"] != "_kyoutu") ? await hankaku2Zenkaku(syllabusFile["■区分"]) : "";
                            var school_year = (facultyId["faculty"] != "_kyoutu") ? syllabusFile["■実施期"] : "";
                            if (school_year.match(/年/))
                                school_year = await hankaku2Zenkaku(school_year.split("年")[0]);
                            else if (school_year.match(/期/))
                                school_year = await hankaku2Zenkaku(getSchoolYear(school_year));
                            var school_year_list = [];
                            if (school_year.length > 1) {
                                var start = parseInt(school_year[0]);
                                var last = parseInt(school_year[school_year.length - 1]);
                                for (var k = start; k <= last; k++) {
                                    school_year_list.push(k.toString());
                                }
                            }
                            else
                                school_year_list.push(school_year);
                            school_year = school_year_list;
                            var credit = await hankaku2Zenkaku(syllabusFile["■単位数"]);
                            var evaluation = await hankaku2Zenkaku(syllabusFile["■成績の評価基準"]);
                            if (!syllabus[day][period][name]["many"]) {
                                syllabus[day][period][name]["department"] = department;
                                syllabus[day][period][name]["imp_period"] = imp_period;
                                syllabus[day][period][name]["section"] = section;
                                syllabus[day][period][name]["school_year"] = school_year;
                                syllabus[day][period][name]["evaluation"] = evaluation;
                                syllabus[day][period][name]["credit"] = credit;
                            }
                            else {
                                syllabus[day][period][name]["imp_period"] = imp_period;
                                syllabus[day][period][name]["section"] = section;
                                syllabus[day][period][name]["school_year"] = school_year;
                                syllabus[day][period][name]["credit"] = credit;
                                syllabus[day][period][name]["evaluation"] = evaluation;
                            }
                            break;
                        }
                    }
                    if (!finded)
                        delete syllabus[day][period][name];
                }
            }
        }
        var db = await admin.database();
        var ref = await db.ref("timetable");
        var day = await ref.child(facultyName).update(
            syllabus
        );
        printSyllabus(syllabus);
    }
    console.log("完了");
}

async function test() {
    var data = {
        "task": "search",
        "nendo": "2020",
        "dept_kbn": "01"
    };
    var options = {
        uri: "http://www.agri-fish-web.jp/syllabus/search/syllabusSearch.php",
        headers: {
            "Content-type": "application/x-www-form-urlencoded"
        },
        encoding: null,
        form: data
    };
    var syllabusFiles;
    await request.post(options)
        .then(async (body) => {
            var iconv = await new Iconv('EUC-JP', 'UTF-8//TRANSLIT//IGNORE');
            syllabusFiles = await iconv.convert(body).toString().split("<tr>");
        });
}


async function fuckNewGomiSyllabus() {
    var days = ["月", "火", "水", "木", "金"];
    var periods = ["1", "2", "3", "4", "5"];
    var facultyIds = {
        "農": "02",
        "水産": "01",
        // "農林水産（院）": "06_1" // こいつだけ処理方法変えないと無理ぽい。めんどいから誰かしてくれ！
    };
    for (var facultyName in facultyIds) {
        var syllabus = await initSyllabus(days, periods);


        const { Iconv } = require('iconv');
        var data = {
            "view_dept_kbn": facultyIds[facultyName],
        };
        var options = {
            uri: "http://www.agri-fish-web.jp/syllabus/search/syllabusSchedule.php",
            headers: {
                "Content-type": "application/x-www-form-urlencoded"
            },
            encoding: null,
            form: data
        };
        await request.post(options)
            .then(async (body) => {
                var iconv = await new Iconv('EUC-JP', 'UTF-8//TRANSLIT//IGNORE');
                var res = await iconv.convert(body).toString().split("<td>");
                var dayIndex = -1;
                var periodIndex = 0;
                for (var i = 1; i < 30; i++) {
                    if (dayIndex != -1) {
                        var day = days[dayIndex];
                        var period = periods[periodIndex];
                        if (res[i].match(/<span/)) {
                            var subjects = res[i].split("<span");
                            for (var j = 1; j < subjects.length; j++) {
                                var name = subjects[j].split(">")[1].split("</span")[0];
                                var teacher = (name.match(/\(/)) ? name.split("(")[1].split(")")[0] : "";
                                name = (name.match(/\(/)) ? name.split("(")[0].trim() : name.trim();
                                if (syllabus[day][period][name]) {
                                    syllabus[day][period][name]["teacher"] = "";
                                    syllabus[day][period][name]["many"] = true;
                                }
                                else {
                                    syllabus[day][period][name] = {};
                                    syllabus[day][period][name]["imp_period"] = "";
                                    syllabus[day][period][name]["room"] = "";
                                    syllabus[day][period][name]["section"] = "";
                                    syllabus[day][period][name]["school_year"] = "";
                                    syllabus[day][period][name]["department"] = "";
                                    syllabus[day][period][name]["teacher"] = teacher;
                                    syllabus[day][period][name]["credit"] = "";
                                    syllabus[day][period][name]["evaluation"] = "";
                                    syllabus[day][period][name]["many"] = false;
                                }
                            }
                        }
                    }

                    dayIndex += 1;
                    if (dayIndex == 5) {
                        dayIndex = -1;
                        periodIndex += 1;
                    }
                }
            });
        sleep.sleep(1);
        var data = {
            "task": "search",
            "nendo": "2020",
            "dept_kbn": facultyIds[facultyName]
        };
        var options = {
            uri: "http://www.agri-fish-web.jp/syllabus/search/syllabusSearch.php",
            headers: {
                "Content-type": "application/x-www-form-urlencoded"
            },
            encoding: null,
            form: data
        };
        var syllabusFiles;
        await request.post(options)
            .then(async (body) => {
                var iconv = await new Iconv('EUC-JP', 'UTF-8//TRANSLIT//IGNORE');
                syllabusFiles = await iconv.convert(body).toString().split("<tr>");
                for (var i = 7; i < syllabusFiles.length; i++) {
                    var syllabusFile = syllabusFiles[i];
                    for (var day in syllabus) {
                        for (period in syllabus[day]) {
                            for (name in syllabus[day][period]) {
                                if (syllabusFile.indexOf(name) != -1) {
                                    var options = {

                                        headers: {
                                            "Content-type": "application/x-www-form-urlencoded"
                                        },
                                        encoding: null,
                                    };
                                    var nendo = syllabusFile.split("doViewSyllabus(\'")[1].split("\'")[0];
                                    var id = syllabusFile.split("doViewSyllabus(\'")[1].split(" \'")[1].split("\'")[0];
                                    var syllabusLink = "http://www.agri-fish-web.jp/syllabus/view/syllabusViewDetail.php?nendo=" + nendo + "&sylb_cd=" + id;
                                    await request.get(syllabusLink, options)
                                        .then(async (body) => {
                                            var iconv = await new Iconv('EUC-JP', 'UTF-8//TRANSLIT//IGNORE');
                                            var detailTables = await iconv.convert(body).toString().split("<table");
                                            var credit = await detailTables[2].split("<tr>")[2].split("<th>")[1].split("</td>")[0].split("<td>")[1];
                                            var evaluation;
                                            evaluation = (facultyName == "農") ? await detailTables[7].split("<tr>") : (facultyName == "水産") ? await detailTables[8].split("<tr>") : [];
                                            evaluation = await evaluation[evaluation.length - 1].split("<td>")[1].split("<")[0];
                                            syllabus[day][period][name]["credit"] = credit;
                                            syllabus[day][period][name]["evaluation"] = evaluation;
                                        });
                                }
                                else {
                                    break;
                                }
                            }
                        }
                    }
                }
            });
        sleep.sleep(1);
        var db = await admin.database();
        var ref = await db.ref("timetable");
        var day = await ref.child(facultyName).update(
            syllabus
        );
        printSyllabus(syllabus);
    }
    console.log("完了");
}

async function main() {
    await fuckGomiSyllabus();
    await fuckNewGomiSyllabus();
}

main();

