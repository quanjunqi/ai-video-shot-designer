// Package breaker 实现供给单元（渠道×模型）级熔断（TASK-ROUTE-003 / dev-plan T4）。
//
// 设计依据（access-design v2.2 §3.4）：
//   - 粒度是【单元】= channel_id + provider_model；同渠道不同模型互不影响。
//   - 多副本状态共享：channel_health 落 execution 共享库，唯一事实源；失败计数/冷却/
//     半开探活占位一律原子 UPDATE（禁实例本地内存，BE-CONC-002）。
//   - 失败语义按表 3-1 错误码分类：硬 4xx 直返不重试不切换；软 4xx 可重试可切换（计入失败）；
//     5xx/超时切换（计入失败）；内容安全拒绝不切换。
//   - 半开探活单飞：冷却到期后同一冷却单元同时只允许一个实例探活（probe_owner 原子占位），
//     探活请求不计入失败计数。探活复用既有执行路径（与 ADR-008 probe 合流方向一致，
//     不新写一套 HTTP 探测）。
package breaker

import "errors"

// Class 是表 3-1 的错误码分类结果。
type Class int

const (
	// ClassHard4xx：硬 4xx（400/401/403/404/422）——不重试、不切换，直接返回。
	// 鉴权/参数/不存在类错误，重试或换渠道无意义。
	ClassHard4xx Class = iota
	// ClassSoft4xx：软 4xx（408/409/425/429）——可重试、可切换，计入失败计数。
	ClassSoft4xx
	// ClassServerError：5xx 与超时——切换，计入失败计数。
	ClassServerError
	// ClassContentSafety：内容安全拒绝（400 + 安全拒绝标记）——不切换。
	// 换渠道同样拒绝，切换浪费配额；不计入失败计数（不是渠道故障）。
	ClassContentSafety
	// ClassNetwork：网络层失败（无 HTTP 状态，如连接失败/超时）——切换，计入失败计数。
	ClassNetwork
	// ClassSuccess：成功（2xx/3xx）。
	ClassSuccess
)

// hard4xx 是表 3-1 的硬 4xx 集合（鉴权/参数/不存在，重试无意义）。
var hard4xx = map[int]bool{400: true, 401: true, 403: true, 404: true, 422: true}

// soft4xx 是表 3-1 的软 4xx 集合（限流/并发/超时类，换渠道可能成功）。
var soft4xx = map[int]bool{408: true, 409: true, 425: true, 429: true}

// Classify 按上游 HTTP 状态码分类（表 3-1）。
//
// status==0 表示网络层失败（连接失败、超时等无响应），归 ClassNetwork。
// contentSafety 为 true 时优先判定为内容安全拒绝（400 + 安全拒绝标记），不切换。
// 2xx/3xx 归 ClassSuccess。
func Classify(status int, contentSafety bool) Class {
	if contentSafety {
		return ClassContentSafety
	}
	switch {
	case status >= 200 && status < 400:
		return ClassSuccess
	case hard4xx[status]:
		return ClassHard4xx
	case soft4xx[status]:
		return ClassSoft4xx
	case status >= 500:
		return ClassServerError
	case status == 0:
		return ClassNetwork
	default:
		// 未列出的 4xx（如 405/413/418/451）保守归软 4xx：可重试可切换，
		// 不把未知 4xx 当硬失败直返（避免误伤可能换渠道成功的场景）。
		return ClassSoft4xx
	}
}

// ErrUnitCooling 表示候选全部处于冷却中，无可用单元（fail-open 之外的显式失败）。
var ErrUnitCooling = errors.New("breaker: all candidate units are cooling")
