import json, csv, io

# Read existing all_locations.json
with open('all_locations.json', 'r', encoding='utf-8') as f:
    all_locs = json.load(f)

# Parse Google Sheet CSV data (saved locally)
# We'll read from the topup_locations_full.csv that we save first
sheet_csv = r"""No,Topup Name,Company Type,MA ID,MA Name,Upper Name,Customer ID,Customer Name,Old Start Owner,Start Owner,Project Type,Promotion Type,Online Status,Last status update,Register Date,Place Detail,Village,Address,Moo,Building,Street,Soi,Distinct,City,Province,PostCode,Online First Time,Lastest Online,GPS Latitude,GPS Longitude
1,BT01621,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 14:38,2/8/22 14:38,Rental,No Promotion,Online,4/4/26 15:55,17/6/2022,ปิยพร เอี่ยมพ่วง,วัดแดง,'58/4,1,,,,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 16:40,4/4/26 15:55,13.8891,100.477
3,BT03735,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 14:38,2/8/22 14:38,Rental,No Promotion,Online,3/31/26 3:30,20/6/2022,ฉัตรชัย ชื่นแช่ม,วัดแดง,'66/17,1,,,,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 16:40,3/31/26 3:30,13.8877,100.48
5,BT04973,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/10/23 17:22,5/10/23 17:22,Rental,No Promotion,Online,3/30/26 4:23,7/3/2018,ร้านพี่เพ็ญวัดไทรม้าใต้,,'80/6,4,,ซ.ไทรม้า 14,ซ.ไทรม้า 14,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,5/10/23 19:44,3/30/26 4:23,13.8618,100.475
6,BT06206,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 17:05,2/8/22 17:05,Rental,No Promotion,Online,4/7/26 1:25,19/8/2022,วราภรณ์ เทพเฉลิม,,'46/2,6,,,,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 17:34,4/6/26 23:47,13.8506,100.469
7,BT06497,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,3/3/25 14:07,3/3/25 14:07,Rental,No Promotion,Online,3/30/26 17:14,30/6/2023,ร้านขายของชำ,,'5/2,,,เรวดี,วัดสมรโกฏิ,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,3/3/25 14:08,3/30/26 17:14,13.8589,100.4986
8,BT06723,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 17:05,2/8/22 17:05,Rental,No Promotion,Online,4/4/26 21:00,17/6/2022,สุกฤตา ธรณ์ธนาโชติ,,'85/7,,,,,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 17:34,4/4/26 21:00,13.865,100.467
9,BT09001,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 16:53,5/9/23 16:53,Rental,No Promotion,Online,4/4/26 9:09,7/12/2018,ร้านค้า,,'126,1,,,,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 17:48,4/4/26 9:09,13.8622,100.4973
10,BT09308,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 17:05,2/8/22 17:05,Rental,No Promotion,Online,3/30/26 4:24,18/7/2022,เพลินพิศ มั่นคง,,'99/59,,,,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 17:34,3/30/26 4:24,13.8529,100.4451
11,BT104942,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,6/6/23 16:54,6/6/23 16:54,Rental,No Promotion,Online,3/30/26 4:28,18/7/2018,ร้านค้า,,'29/100,,,,,บางเขน,เมืองนนทบุรี,นนทบุรี,11000,6/6/23 17:48,3/30/26 4:28,13.8705,100.5446
12,BT106950,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/9/22 16:20,2/9/22 16:20,Rental,No Promotion,Online,4/6/26 8:48,10/5/2022,82/3  ม.1,,'82/3,1,,,,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,2/9/22 17:35,4/6/26 8:48,13.8915,100.473
13,BT108230,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 15:11,5/9/23 15:11,Rental,No Promotion,Online,3/30/26 4:24,21/3/2018,บ้านสอยคอนโดมิเนียม,,'888,8,,รัตนาธิเบศร์,,บางกระสอ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 15:43,3/30/26 4:24,13.8633,100.5038
14,BT109092,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/6/23 17:23,10/6/23 17:23,Rental,No Promotion,Online,3/31/26 22:59,25/9/2017,ร้านค้า,,'89/165,3,,,,บางศรีเมือง,เมืองนนทบุรี,นนทบุรี,11000,10/7/23 13:31,3/31/26 22:59,13.8454,100.48
15,BT111383,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/1/23 17:10,12/1/23 17:10,TOPS,No Promotion,Online,4/5/26 8:36,23/5/2022,Tops เจ้าพระยาวิลล่า,บางกร่าง,'122/225,5,,บางกรวย-ไทรน้อย,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,12/1/23 17:48,4/5/26 8:36,13.8433,100.4422
16,BT117027,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 15:41,5/8/23 15:41,Rental,No Promotion,Online,4/3/26 17:42,1/6/2023,หน้าร้านค้า,,'40/5,3,,,,บางไผ่,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 17:08,4/3/26 17:42,13.8254,100.8475
17,BT11833,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 14:38,2/8/22 14:38,Rental,No Promotion,Online,4/5/26 3:18,27/6/2022,จารึก ภิรักจรรยากุล,คลองหลุมมะดัน,'77,3,,,,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 16:41,4/5/26 3:18,13.8694,100.474
19,BT123199,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/10/23 17:22,5/10/23 17:22,Rental,No Promotion,Online,4/1/26 10:16,3/5/2017,ร้านค้า,บางรักน้อย,'70/26,3,,รัตนาธิเบศร์,บางรักน้อย16,บางรักน้อย,เมืองนนทบุรี,นนทบุรี,11000,5/10/23 19:44,4/1/26 10:16,13.8658,100.456
20,BT123251,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 11:13,5/9/23 11:13,Rental,No Promotion,Online,3/30/26 4:26,26/6/2023,ร้านค้า,,'20,,,ติวานนท์,เปรมฤทัย 23,ท่าทราย,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 11:44,3/30/26 4:26,13.8843,100.5032
21,BT123852,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/3/23 14:48,4/4/24 16:13,Rental ประกบ 7-11,No Promotion,Online,4/3/26 9:16,11/6/2013,ชนิดา พึ่งเงิน,หมู่ที่ 8,'13,,,รัตนาธิเบศร์,รัตนาธิเบศร์17,บางกระสอ,เมืองนนทบุรี,นนทบุรี,11000,10/3/23 15:13,4/3/26 9:16,13.8618,100.5005
22,BT123853,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/3/23 14:48,10/3/23 14:48,Rental,No Promotion,Online,4/3/26 9:16,28/8/2013,ร้านค้า,,'17/76,1,,-,เรวดี37/1,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,10/3/23 15:13,4/3/26 9:16,13.5124,100.30036
24,BT125137,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/22/23 15:43,5/22/23 15:43,Lawson,No Promotion,Online,4/7/26 6:20,8/3/2019,Lawson หมู่บ้านตะวันนา,,'5/11,5,,,,บางกระสอ,เมืองนนทบุรี,นนทบุรี,11000,5/25/23 18:20,4/6/26 6:13,13.8747,100.4992
25,BT130136,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 17:05,2/8/22 17:05,Rental,No Promotion,Online,4/5/26 14:39,25/5/2022,จิณณ์ฐิดา กิตติโชควัฒนา,,'84/11,4,,,,ไทรม้า,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 17:34,4/5/26 14:39,13.8624,100.47
26,BT132277,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 15:11,5/9/23 15:11,Rental,No Promotion,Online,4/3/26 9:16,20/6/2017,ร้านค้า,,'22,,,,เลี่ยงเมืองนนทบุรี15แยก2,บางกระสอ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 15:44,4/3/26 9:16,13.8753,100.4945
29,BT133424,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 16:53,5/9/23 16:53,Rental,No Promotion,Online,4/4/26 8:43,26/6/2023,ร้านค้าคุณณัฐพล,,'159,3,,,นนทบุรี 6,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 17:52,4/4/26 8:43,13.859,100.4882
30,BT135702,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 10:40,5/8/23 10:40,Rental,No Promotion,Online,3/30/26 4:23,24/2/2023,ร้านค้า,,'89/1,8,,,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 12:38,3/30/26 4:23,13.85,100.4548
34,BT145851,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 11:13,5/9/23 11:13,Rental,No Promotion,Online,3/30/26 4:22,7/6/2023,ร้านค้า,,'18,4,,,,ท่าทราย,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 11:44,3/30/26 4:22,13.8865,100.4913
36,BT147989,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/20/23 16:25,12/20/23 16:25,เอื้ออาทร,Transfer to Agent1,Online,3/30/26 17:13,4/5/2013,บ้านเอื้ออาทร ราชพฤกษ์ (ใต้อาคาร 9),,',,,-,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,12/21/23 9:24,3/30/26 17:13,13.8435,100.4466
37,BT147990,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/20/23 16:25,12/20/23 16:25,เอื้ออาทร,Transfer to Agent1,Online,3/30/26 17:13,4/5/2013,บ้านเอื้ออาทร ราชพฤกษ์ (ใต้อาคาร 14),,',,,-,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,12/21/23 9:24,3/30/26 17:13,13.8439,100.447
38,BT147993,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/20/23 16:25,12/20/23 16:25,เอื้ออาทร,Transfer to Agent1,Online,3/31/26 21:09,2/5/2013,บ้านเอื้ออาทร ราชพฤกษ์ ใต้อาคาร22,,',,,-,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,12/21/23 9:24,3/31/26 21:09,13.8414,100.4463
39,BT148017,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/6/23 12:59,10/6/23 12:59,Rental ประกบ 7-11,No Promotion,Online,4/3/26 9:17,2/8/2022,ร้านค้า,-,'1,0,,,เลี่ยงเมืองนนทบุรี15 แยก 2,บางกระสอ,เมืองนนทบุรี,นนทบุรี,11000,10/6/23 14:13,4/3/26 9:17,13.8738,100.4936
42,BT152270,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/12/23 16:36,10/12/23 16:36,เมืองไทยลิสซิ่ง,No Promotion,Online,3/30/26 4:26,27/12/2021,เมืองไทยลิสซิ่ง สาขาสามัคคี 25,,'223,,,สามัคคี,,ท่าทราย,เมืองนนทบุรี,นนทบุรี,11000,10/12/23 17:51,3/30/26 4:26,13.8859,100.5184
43,BT152289,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/6/23 12:59,1/15/26 15:45,Rental,No Promotion,Online,4/6/26 10:58,15/1/2026,หน้าบ้านคุณธวัชชัย,,'50,,,ติวานนท์,,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,10/6/23 14:13,4/6/26 10:58,13.84329,100.51107
44,BT152332,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/12/23 16:36,10/12/23 16:36,Family Mart,No Promotion,Online,3/30/26 4:22,29/10/2014,2137-Family Mart หมู่บ้านภัทรนิเวศน์,,'29/2,1,,,,ท่าทราย,เมืองนนทบุรี,นนทบุรี,11000,10/12/23 17:51,3/30/26 4:22,13.8835,100.5274
45,BT152335,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/12/23 16:36,4/19/24 17:18,Rental,No Promotion,Online,4/4/26 11:56,13/3/2014,อพาร์ทเมนท์,,'71/1,,,,ประชานิเวศน์ 3 ซอย 8/3 แยก 12,ท่าทราย,เมืองนนทบุรี,นนทบุรี,11000,10/12/23 17:50,4/4/26 11:56,13.8778,100.5254
49,BT183385,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/3/23 14:48,10/3/23 14:48,Lawson,No Promotion,Online,4/3/26 4:25,8/10/2013,Lawson-SL003บางศรีเมือง นนทบุรี อ.เมือง นนทบุรี(06...23),บางศรีเมือง,'88 88/1-2,5,,-,,บางศรีเมือง,เมืองนนทบุรี,นนทบุรี,11000,10/4/23 4:06,4/3/26 4:25,13.8356,100.4819
50,BT183386,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/6/23 12:59,10/6/23 12:59,Lawson,No Promotion,Online,4/6/26 23:13,8/10/2013,Lawson-SL003ซอยเรวดี 30 อ.เมือง นนทบุรี(06...24),ตลาดขวัญ,'130/53-84,4,,-,,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,10/6/23 14:13,4/6/26 23:13,13.8552,100.5091
51,BT183387,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/3/23 13:42,5/3/23 13:42,Lawson,No Promotion,Online,4/6/26 22:53,8/10/2013,Lawson-SL003หมู่บ้านนวนิช แจ้งวัฒนะ อ.ปากเกร็ด นนทบุรี(06...24),หงษ์ทอง,',,,-,,บางพูด,ปากเกร็ด,นนทบุรี,11120,5/3/23 16:51,4/6/26 22:53,13.9121,100.5209
52,BT185001,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,9/9/21 17:19,9/9/21 17:19,MINI ATM,No Promotion,Out of Service,,16/9/2021,อาคาร KBTG,,'46/6,,,ป๊อปปูล่า,,บ้านใหม่,ปากเกร็ด,นนทบุรี,11120,,,13.910586,100.551488
53,BT185028,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,11/22/23 15:32,11/22/23 15:32,MINI ATM,No Promotion,Online,3/30/26 4:24,16/9/2021,KBTG KBANK เมืองทองธานี อาคาร KBTG,,'46/6,,,ป๊อปปูล่า,,บ้านใหม่,ปากเกร็ด,นนทบุรี,11120,11/22/23 15:39,3/30/26 4:24,0,0
54,BT21229,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 15:41,5/8/23 15:41,Rental,No Promotion,Online,4/3/26 5:56,18/8/2023,ร้านค้า,,'24/4,1,,,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 17:08,4/3/26 5:56,13.8192,100.4569
55,BT22028,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 16:53,5/9/23 16:53,Rental,No Promotion,Online,4/3/26 9:15,12/6/2018,อามีนะห์ อพาร์ทเม้นท์,,',,,,,บางกระสอ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 17:53,4/3/26 9:15,13.8557,100.4867
56,BT22319,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 16:53,5/9/23 16:53,Rental,No Promotion,Online,3/30/26 4:20,7/6/2023,ร้านค้า,,'56/56,3,,ซ.นวลละออ,,คลองพระอุดม,ปากเกร็ด,นนทบุรี,11120,5/9/23 17:53,3/30/26 4:20,13.9276,100.4834
57,BT23320,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/11/23 13:10,5/11/23 13:10,Rental,No Promotion,Online,4/7/26 0:38,1/5/2023,หน้าบ้าน,,'66,,,,พิบูลสงคราม 5 แยก 1,สวนใหญ่,เมืองนนทบุรี,นนทบุรี,11000,5/11/23 13:34,4/4/26 12:23,13.8226,100.5023
58,BT23761,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/30/25 17:14,5/30/25 17:14,PT,No Promotion,Online,4/6/26 18:20,18/6/2025,PTถ.ราชพฤกษ์ 2,,'62/20,6,,,,คลองข่อย,ปากเกร็ด,นนทบุรี,11120,6/18/25 13:12,4/6/26 18:20,13.967666,100.46255
59,BT24465,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 10:40,5/8/23 10:40,Rental,No Promotion,Online,3/30/26 10:39,13/6/2023,ร้านค้า,,'69/10,9,,ท่าน้ำ-วัดโบสถ์,วัดพุฒิฯ,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 12:39,3/30/26 10:39,13.8431,100.468
60,BT24499,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/15/25 11:00,12/15/25 11:00,Lawson,No Promotion,Online,3/30/26 4:22,23/12/2025,Lawson ปั๊ม CALTEX ราชพฤกษ์,,'100/1,1,,ราชพฤกษ์,,อ้อมเกร็ด,ปากเกร็ด,นนทบุรี,11120,12/22/25 17:13,3/30/26 4:22,13.901869,100.450239
61,BT25554,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/11/24 10:58,2/21/25 14:24,Rental,No Promotion,Online,4/4/26 13:46,21/2/2025,ที่อยู่อาศัย,,'5,4,,,,คลองพระอุดม,ปากเกร็ด,นนทบุรี,11120,12/19/24 8:53,4/4/26 13:46,13.923477,100.485497
62,BT28980,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 10:40,5/8/23 10:40,Rental,No Promotion,Out of Service,4/7/26 8:33,26/1/2018,บ้านคุณปณิชชญาภา (บางกร่าง),,'37/7,9,,บางศรีเมือง ซ.3,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 12:39,4/6/26 23:45,13.838,100.4677
63,BT29015,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 16:53,5/9/23 16:53,Rental,No Promotion,Online,4/3/26 9:17,27/2/2023,ร้านค้า,,'33,0,,,นนทบุรี 6,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 17:53,4/3/26 9:17,13.8588,100.4839
64,BT29097,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/11/23 14:54,5/11/23 14:54,Rental,No Promotion,Online,4/2/26 3:02,19/11/2021,ร้านพานาโซนิค,,'78/121,4,,ประชาราษฎร์,,สวนใหญ่,เมืองนนทบุรี,นนทบุรี,11000,5/11/23 15:31,4/2/26 3:02,13.8443,100.4953
65,BT29189,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,6/11/20 13:15,6/11/20 13:15,Rental,No Promotion,Online,4/7/26 3:04,14/7/2020,หน้าร้านชำ,บางกร่าง,'96/93,,,,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,7/13/20 11:38,4/4/26 3:04,13.8477,100.4419
66,BT31076,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/25/23 13:30,12/25/23 13:30,TOT,Transfer to Agent1,Online,4/7/26 7:27,25/7/2024,ร้านค้า,,',,,,จิตรวิสุทธิ  2,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,12/25/23 15:10,4/6/26 7:29,13.8305,100.4749
67,BT33469,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 14:38,2/8/22 14:38,Rental,No Promotion,Online,4/5/26 3:57,28/3/2022,เสาวนีย์ เจริญสุข,สุเหร่ามัสยิด,'73/4,6,,,,ท่าอิฐ,ปากเกร็ด,นนทบุรี,11120,2/8/22 16:41,4/5/26 3:57,13.8979,100.475
68,BT33813,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/1/23 16:51,10/22/24 14:01,Rental,No Promotion,Online,3/30/26 4:24,11/3/2024,ร้านค้า,,'74/9,3,,,,บางรักน้อย,เมืองนนทบุรี,นนทบุรี,11000,12/1/23 17:28,3/30/26 4:24,13.871988,100.45571
69,BT35219,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/3/23 14:48,10/3/23 14:48,เอื้ออาทร,No Promotion,Online,4/6/26 16:50,29/5/2015,เอื้ออาทรวัดกู้ 4 อาคาร 93 บริเวณทางขึ้นอาคาร,หงษ์ทอง,'193,3,อาคาร 93 ชั้น 1,,,บางพูด,ปากเกร็ด,นนทบุรี,11120,10/3/23 15:13,4/6/26 16:50,13.9325,100.5158
70,BT36249,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/5/22 17:02,2/5/22 17:02,Rental,No Promotion,Online,4/4/26 10:11,27/6/2022,มนตรี บางจริง,คลองขุด,'36/1,6,,,,คลองข่อย,ปากเกร็ด,นนทบุรี,11120,2/5/22 18:49,4/4/26 10:11,13.954,100.4443
71,BT38114,FSDT,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,11/6/24 12:52,11/6/24 12:52,Rental,Transfer to Agent1,Online,3/30/26 17:43,9/7/2015,ข้างร้านพัฒนาพันธ์ ในซ.ประชาราษฏร์ 15,,'138/2,4,,,,สวนใหญ่,เมืองนนทบุรี,นนทบุรี,11000,11/12/24 13:04,3/30/26 17:43,13.8418,100.4946
72,BT40871,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 15:41,5/8/23 15:41,Rental,No Promotion,Online,4/4/26 15:29,14/2/2019,ประสมทรัพย์อพาร์เม้นท์ ( บางศรีเมือง ),,',,,,,บางศรีเมือง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 17:05,4/4/26 15:29,13.8321,100.4814
73,BT50238,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 16:53,10/22/24 14:34,Rental,No Promotion,Online,4/3/26 12:29,18/10/2024,ร้านค้า,,'135/379,,,,,ตลาดขวัญ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 17:53,4/3/26 12:29,13.856609,100.505107
74,BT50527,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/15/23 9:51,5/15/23 11:19,PT,No Promotion,Online,4/6/26 12:59,7/4/2023,PT ถ.สะพานนวลฉวี,,'72/40,3,,,,บ้านใหม่,ปากเกร็ด,นนทบุรี,11120,5/15/23 11:49,4/6/26 12:59,13.9424,100.5409
75,BT52586,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,11/13/24 10:00,1/28/25 15:20,Rental,No Promotion,Online,3/30/26 4:28,28/1/2025,ที่อยู่อาศัย,,'102,,,,ติวานนท์37,ท่าทราย,เมืองนนทบุรี,,11/29/24 16:11,3/30/26 4:28,13.88186,100.508418
76,BT52664,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 14:38,2/8/22 14:38,Rental,No Promotion,Online,4/6/26 7:55,28/3/2022,สนอง หอมโปร่ง,วัดบางจาก,'19/1,1,,,,คลองพระอุดม,ปากเกร็ด,นนทบุรี,11120,2/8/22 16:41,4/6/26 7:55,13.9173,100.486
77,BT52809,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 14:38,2/8/22 14:38,Rental,No Promotion,Online,3/31/26 23:00,13/11/2019,ตีมะ เลาะเฮาะ,บางบัวทอง,'62/73,5,,,,ท่าอิฐ,ปากเกร็ด,นนทบุรี,11120,2/8/22 16:41,3/31/26 23:00,13.9003,100.47
78,BT52926,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/16/25 12:55,10/16/25 12:55,TOT,Transfer to Agent1,Online,3/31/26 3:18,15/6/2016,ซ.บางศรีเมือง 59,กลางวัดสลักใต้,',,,,,บางศรีเมือง,เมืองนนทบุรี,นนทบุรี,11000,10/16/25 12:56,3/31/26 3:18,13.8438,100.4868
79,BT53103,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/11/23 13:10,5/11/23 13:10,Rental,No Promotion,Online,3/31/26 23:00,1/6/2023,ตึกฉลวยลักษณ์พิบูลสงครามซ.2แยก3,,'1/1,1,,,,สวนใหญ่,เมืองนนทบุรี,นนทบุรี,11000,5/11/23 13:35,3/31/26 23:00,13.8236,100.5063
80,BT54308,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/10/25 15:20,12/11/25 15:35,Rental,No Promotion,Online,4/7/26 0:52,10/11/2025,หน้าบ้านคุณประทิน,,'29/4,11,,,,คลองข่อย,ปากเกร็ด,นนทบุรี,11120,11/8/25 10:13,3/31/26 22:59,13.985387,100.399887
81,BT55483,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/12/23 17:36,5/12/23 17:36,Rental,No Promotion,Online,3/30/26 4:25,8/6/2023,ร้านค้า,,'3/46,1,,,,บ้านใหม่,ปากเกร็ด,นนทบุรี,11120,5/12/23 18:01,3/30/26 4:25,13.9087,100.5532
82,BT59272,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 16:53,5/9/23 16:53,Rental,No Promotion,Online,4/3/26 9:15,15/7/2022,ร้านค้า,,'7,0,,,นนทบุรี 7,สวนใหญ่,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 17:54,4/3/26 9:15,13.8564,100.4808
83,BT59793,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 10:40,5/8/23 10:40,Rental,No Promotion,Online,3/31/26 19:39,7/6/2023,ร้านค้า,,'89/557,3,,,,บางศรีเมือง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 12:39,3/31/26 19:39,13.8469,100.4823
84,BT62079,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 10:40,5/8/23 10:40,Rental,No Promotion,Online,4/6/26 18:27,4/12/2017,ศาลาวัดโตนด (บางกร่าง),,'0,,,,,บางกร่าง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 12:38,4/6/26 18:27,13.848,100.4672
85,BT62355,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/8/23 10:40,5/8/23 10:40,Rental,No Promotion,Online,3/30/26 4:21,1/6/2023,ร้านค้า,,'89/296,3,,บางศรีเมือง-วัดโบสถ์,7 วัดเฉลิม,บางศรีเมือง,เมืองนนทบุรี,นนทบุรี,11000,5/8/23 12:39,3/30/26 4:21,13.8464,100.4791
86,BT63749,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 15:11,10/17/24 10:24,Rental,No Promotion,Online,4/3/26 9:15,17/10/2024,ร้านค้า,,'37,8,,รัตนาธิเบศธ์,รัตนาธิเบศธ์ 38,บางกระสอ,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 15:45,4/3/26 9:15,13.05811,100.86315
87,BT64012,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/11/23 13:10,5/11/23 13:10,Rental,No Promotion,Online,3/30/26 17:40,10/9/2020,ร้านไข่ร้อนน้ำเย็นวัดเขมา,,'45,8,,,,สวนใหญ่,เมืองนนทบุรี,นนทบุรี,11000,5/11/23 14:09,3/30/26 17:40,13.8223,100.5043
88,BT64420,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/9/23 11:13,5/9/23 11:13,Rental,No Promotion,Online,3/30/26 4:20,14/6/2023,ร้านค้า,,'1/1,1,,,,ท่าทราย,เมืองนนทบุรี,นนทบุรี,11000,5/9/23 11:45,3/30/26 4:20,13.8926,100.4977
89,BT66127,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,5/11/23 13:10,9/23/24 15:53,Rental,No Promotion,Online,3/30/26 17:13,23/9/2024,ร้านค้า,,'2/80,,,ประชาราษฎร์,,สวนใหญ่,เมืองนนทบุรี,นนทบุรี,11000,5/11/23 13:35,3/30/26 17:13,13.843686,100.498283
90,BT66629,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,12/11/24 10:58,1/8/25 9:08,Rental,No Promotion,Online,4/3/26 15:12,8/1/2025,ร้านค้า,,'1007,,,,,คลองข่อย,ปากเกร็ด,นนทบุรี,11120,12/21/24 14:16,4/3/26 15:12,13.974616,100.441362
91,BT72649,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/3/23 14:05,10/3/23 14:05,เอื้ออาทร,No Promotion,Online,3/30/26 4:23,23/7/2015,บ้านเอื้ออาทรวัดกู้ นิติ 3 อาคาร 68,หงษ์ทอง,',3,อาคาร 59 ชั้น 1,,,บางพูด,ปากเกร็ด,นนทบุรี,11120,10/3/23 14:30,3/30/26 4:23,13.9342,100.5145
92,BT72650,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,10/3/23 14:05,10/3/23 14:09,เอื้ออาทร,No Promotion,Online,4/2/26 16:55,23/7/2015,บ้านเอื้ออาทรวัดกู้ นิติ 3 อาคาร 59,หงษ์ทอง,',3,อาคาร 59 ชั้น 1,,,บางพูด,ปากเกร็ด,นนทบุรี,11120,10/3/23 14:30,4/2/26 16:55,13.9325,100.5158
93,BT74057,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/14/24 9:10,2/14/24 9:10,Rental,No Promotion,Online,3/31/26 10:12,13/3/2024,ร้านค้าคุณอัครพร,,'17,,,,,ท่าทราย,เมืองนนทบุรี,นนทบุรี,11000,2/21/24 13:58,3/31/26 10:12,13.8813,100.516
94,BT74653,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/14/24 9:11,4/22/24 15:20,Rental,No Promotion,Online,3/30/26 4:27,13/3/2024,ร้านค้าคุณบุญเยี่ยม,,',6,,,,บ้านใหม่,ปากเกร็ด,นนทบุรี,11120,2/21/24 10:58,3/30/26 4:27,13.9522,100.544
95,BT76691,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/7/22 11:09,2/7/22 11:09,Rental,No Promotion,Online,3/30/26 8:21,25/5/2022,ร้านอาหารตามสั่ง,คลองข่อย,'13/12,3,,,,คลองข่อย,ปากเกร็ด,นนทบุรี,11120,2/7/22 13:43,3/30/26 8:21,13.9414,100.4606
96,BT77253,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/8/22 17:05,2/8/22 17:05,Rental,No Promotion,Online,3/30/26 4:22,17/6/2022,บรรพต บุญมี,,'14/1,2,,,,บางรักน้อย,เมืองนนทบุรี,นนทบุรี,11000,2/8/22 17:34,3/30/26 4:22,13.8618,100.453
97,BT91788,FSS,7,Forth Smart Service,Forth Smart Service,7,Forth Smart Service,2/16/24 16:01,5/23/24 17:36,Rental,No Promotion,Online,3/30/26 4:21,17/3/2016,ร้านค้า,,'89/730,3,,,,บางศรีเมือง,เมืองนนทบุรี,นนทบุรี,11000,4/6/24 20:01,3/30/26 4:21,13.845547,100.481687"""

# Parse CSV
reader = csv.reader(io.StringIO(sheet_csv))
header = next(reader)
print(f"Header: {header}")
print(f"City index: {header.index('City')}")
print(f"Topup Name index: {header.index('Topup Name')}")
print(f"GPS Latitude index: {header.index('GPS Latitude')}")
print(f"GPS Longitude index: {header.index('GPS Longitude')}")

sheet_entries = []
for row in reader:
    if len(row) < 30:
        continue
    name = row[1]  # Topup Name
    city = row[23]  # City
    try:
        lat = float(row[28])
        lng = float(row[29])
    except:
        continue
    if lat == 0 and lng == 0:
        continue
    sheet_entries.append({
        "name": name,
        "lat": lat,
        "lng": lng,
        "list": "BT-Topup",
        "city": city
    })

print(f"Sheet entries: {len(sheet_entries)}")

# Add city="" to existing takeout entries
for loc in all_locs:
    if "city" not in loc:
        loc["city"] = ""

# Merge: add sheet entries (avoid duplicates by name)
existing_names = set(l["name"] for l in all_locs)
added = 0
updated = 0
for entry in sheet_entries:
    if entry["name"] in existing_names:
        # Update city info for existing entries
        for loc in all_locs:
            if loc["name"] == entry["name"]:
                loc["city"] = entry["city"]
                updated += 1
                break
    else:
        all_locs.append(entry)
        added += 1

print(f"Updated city for {updated} existing entries")
print(f"Added {added} new entries")
print(f"Total locations: {len(all_locs)}")

# Save
with open('all_locations.json', 'w', encoding='utf-8') as f:
    json.dump(all_locs, f, ensure_ascii=False, indent=2)

print("Saved all_locations.json")
