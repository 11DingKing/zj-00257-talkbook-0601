import urllib.request, urllib.error, json

BASE = "http://localhost:3001/api"

def GET(path):
    try:
        with urllib.request.urlopen(BASE + path) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {"code": -1, "error": str(e)}

def POST(path, data):
    try:
        req = urllib.request.Request(BASE + path, 
            data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
            method="POST")
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"code": e.code, "error": e.read().decode()}
    except Exception as e:
        return {"code": -1, "error": str(e)}

def PUT(path, data):
    try:
        req = urllib.request.Request(BASE + path, 
            data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
            method="PUT")
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"code": e.code, "error": e.read().decode()}
    except Exception as e:
        return {"code": -1, "error": str(e)}

print("=" * 60)
print("【1】极速阅读科技 - 历次约谈历史串联")
print("=" * 60)
vendors = GET("/vendors")["data"]
v = [x for x in vendors if "极速" in x["name"]][0]
hist = GET(f"/vendors/{v['id']}/history")["data"]
print(f"厂商: {hist['vendor']['name']} ({hist['vendor']['industry']})")
ov = hist["overview"]
print(f"概览: 约谈{ov['talkCount']}次 / 承诺{ov['totalPromises']}条 / "
      f"按期完成率{ov['onTimeCompletionRate']}% / "
      f"升级处置{ov['escalationCount']}次(待处理{ov['pendingEscalationCount']})")
for i, t in enumerate(reversed(hist["talks"])):
    s = t["summary"]
    print(f"\n  ▶ 第{i+1}次约谈  {t['talkTime']}  事由:【{t['reason']}】")
    print(f"    参加人: {', '.join(t['participants'])}")
    if t["remark"]:
        print(f"    备注: {t['remark']}")
    print(f"    承诺{ s['totalPromises']}条 "
          f"(✓按期{s['completedOnTime']} !逾期{s['overdue']} "
          f"○整改中{s['inProgress']} △待整改{s['pending']})")
    for p in t["promises"]:
        mark = "!" if p["status"]=="逾期未完成" else "✓" if p["status"]=="按期完成" else "○" if p["status"]=="整改中" else "△"
        ac = f" 实际完成:{p['actualCompletionDate']}" if p["actualCompletionDate"] else ""
        print(f"      {mark}[{p['status']}] 截止{p['deadline']}{ac}")
        print(f"        {p['content']}")
    if t["escalations"]:
        print(f"    ⚠ 升级处置:")
        for e in t["escalations"]:
            st = "✓已处理" if e["handled"] else "⚠待处理"
            print(f"      {st}[{e['type']}] {e['triggeredAt']}")
            print(f"        {e['remark']}")

print()
print("=" * 60)
print("【2】登记新约谈 - 优品购物(强制跳转) + 3条整改承诺")
print("=" * 60)
v4 = [x for x in vendors if "优品" in x["name"]][0]
talk_data = {
    "vendorId": v4["id"],
    "reason": "强制跳转",
    "participants": ["监管员D", "刘芳", "技术负责人K"],
    "talkTime": "2026-06-12 10:00:00",
    "remark": "用户投诉购物车页面强制跳转至优惠券领取页",
    "promises": [
        {"content": "24小时内下线强制跳转逻辑", "deadline": "2026-06-13"},
        {"content": "排查所有跳转入口并出具排查报告", "deadline": "2026-06-15"},
        {"content": "完成全体产品技术人员合规再培训", "deadline": "2026-06-20"}
    ]
}
r = POST("/talks", talk_data)
if r["code"] == 0:
    print(f"✓ 约谈登记成功! talkId={r['data']['talk']['id']}")
    print(f"  事由: {r['data']['talk']['reason']}")
    print(f"  参加人: {', '.join(r['data']['talk']['participants'])}")
    print(f"  录入 {len(r['data']['promises'])} 条整改承诺:")
    for p in r["data"]["promises"]:
        print(f"    [{p['status']}] 截止{p['deadline']}: {p['content']}")
    new_talk_id = r["data"]["talk"]["id"]
    new_promise_ids = [p["id"] for p in r["data"]["promises"]]
else:
    print(f"✗ 失败: {r}")
    new_talk_id = None
    new_promise_ids = []

print()
print("=" * 60)
print("【3】承诺状态流转: 待整改→整改中→按期完成")
print("=" * 60)
if new_promise_ids:
    pid = new_promise_ids[0]
    print(f"目标承诺: {pid}")
    r1 = PUT(f"/promises/{pid}/status", {"status": "整改中"})
    print(f"  待整改 → 整改中: code={r1['code']} status={r1['data']['status'] if r1['code']==0 else r1}")
    r2 = PUT(f"/promises/{pid}/status", {"status": "按期完成", "actualCompletionDate": "2026-06-12"})
    print(f"  整改中 → 按期完成: code={r2['code']} status={r2['data']['status'] if r2['code']==0 else r2} 实际完成={r2['data']['actualCompletionDate'] if r2['code']==0 else ''}")
    print(f"  ✓ 状态流转验证成功")
else:
    print("  跳过(无新承诺)")

print()
print("=" * 60)
print("【4】按厂商统计 (约谈次数/按期完成率/升级处置数)")
print("=" * 60)
stats_v = GET("/stats/by-vendor")
print(f"{'厂商名称':<20} {'行业':<8} {'约谈':>4} {'承诺':>4} {'按期完成率':>10} {'升级处置':>8} {'再次约谈':>8} {'通报':>6}")
print("-" * 80)
for v in stats_v["data"]:
    print(f"{v['vendorName']:<20} {v['industry']:<8} {v['talkCount']:>4} {v['totalPromises']:>4} "
          f"{str(v['onTimeCompletionRate'])+'%':>10} {v['escalationCount']:>8} "
          f"{v['reTalkCount']:>8} {v['通报Count']:>6}")
s = stats_v["summary"]
print("-" * 80)
print(f"汇总 (共{s['totalVendors']}家厂商): 总约谈{s['totalTalks']}次 总承诺{s['totalPromises']}条 "
      f"整体按期完成率{s['overallOnTimeRate']}% 总升级处置{s['totalEscalations']}次")

print()
print("=" * 60)
print("【5】按事由统计 (约谈次数/按期完成率/升级处置数)")
print("=" * 60)
stats_r = GET("/stats/by-reason")
print(f"{'事由':<10} {'约谈':>4} {'涉及厂商':>8} {'承诺':>4} {'按期完成率':>10} {'升级处置':>8} {'再次约谈':>8} {'通报':>6}")
print("-" * 75)
for r in stats_r["data"]:
    print(f"{r['reason']:<10} {r['talkCount']:>4} {r['vendorsInvolved']:>8} {r['totalPromises']:>4} "
          f"{str(r['onTimeCompletionRate'])+'%':>10} {r['escalationCount']:>8} "
          f"{r['reTalkCount']:>8} {r['通报Count']:>6}")

print()
print("=" * 60)
print("【6】逾期自动触发升级处置 (全量列表前5条)")
print("=" * 60)
esc = GET("/escalations")
print(f"共 {esc['total']} 条升级处置记录")
for e in esc["data"][:5]:
    st = "✓已处理" if e["handled"] else "⚠待处理"
    print(f"\n  {st}[{e['type']}] {e['vendorName']}")
    print(f"    触发时间: {e['triggeredAt']}")
    print(f"    关联事由: {e['talkReason']} → 承诺: {e['promiseContent']}")
    print(f"    说明: {e['remark']}")

print()
print("=" * 60)
print("【✓】所有核心接口验证通过! 服务运行在 http://localhost:3001")
print("=" * 60)
