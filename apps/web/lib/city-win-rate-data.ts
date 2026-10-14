/**
 * 城市战绩数据层的转出口。
 *
 * 逻辑已经下沉到 `@weather-smart-money/data`，因为扩展端真正打的是 worker
 * （app.lukaluka.fun）而不是 admin（admin.lukaluka.fun），两个后端都必须能用
 * 同一份实现——不然两边的胜率口径迟早会漂。
 *
 * 这里只做 re-export，admin 侧 route 继续从 `@/lib/city-win-rate-data` 引用。
 */
export * from "@weather-smart-money/data";
