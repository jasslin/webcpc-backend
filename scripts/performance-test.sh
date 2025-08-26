#!/bin/bash

# VDRS 遙測系統性能壓測腳本
# 基於生產優化建議進行壓力測試

set -e

# 測試配置
CONCURRENT_CONNECTIONS=${1:-20}  # 基於建議的連接池大小
RECORDS_PER_BATCH=${2:-500}     # 基於建議的批次大小
TEST_DURATION=${3:-120}         # 測試時間（秒）
API_ENDPOINT="http://localhost:3000/api/telemetry/batch"

echo "🚀 開始 VDRS 遙測系統壓力測試"
echo "📊 測試參數："
echo "   - 並發連接數: $CONCURRENT_CONNECTIONS"
echo "   - 每批次記錄數: $RECORDS_PER_BATCH"
echo "   - 測試持續時間: $TEST_DURATION 秒"
echo "----------------------------------------"

# 創建測試數據目錄
mkdir -p ./test-data
cd ./test-data

# 生成台灣地區的測試數據
generate_test_data() {
    local batch_size=$1
    local batch_id=$2
    
    cat > "test_batch_${batch_id}.json" << EOF
[
EOF

    for ((i=1; i<=batch_size; i++)); do
        # 台灣地區經緯度範圍
        longitude=$(echo "scale=7; 120.0 + ($(shuf -i 0-3000 -n 1) / 1000)" | bc)
        latitude=$(echo "scale=7; 22.0 + ($(shuf -i 0-4000 -n 1) / 1000)" | bc)
        
        # 隨機車牌號碼
        license_plate="TEST-$(printf "%04d" $((RANDOM % 9999 + 1)))"
        
        # 當前時間加上隨機偏移
        current_time=$(date -u -d "+$((RANDOM % 60)) seconds" +%Y-%m-%dT%H:%M:%S.%3NZ)
        
        # 隨機車輛數據
        speed=$((RANDOM % 120))
        gps_speed=$((speed + RANDOM % 10 - 5))
        direction=$((RANDOM % 360))
        csq=$((RANDOM % 31 + 1))
        
        # 根據建議，拉平常查欄位
        ignition=$([ $((RANDOM % 10)) -gt 2 ] && echo "true" || echo "false")
        engine_on=$([ $((RANDOM % 10)) -gt 3 ] && echo "true" || echo "false")
        fuel_level=$((RANDOM % 100 + 1))
        battery_voltage=$(echo "scale=1; 11.0 + ($(shuf -i 0-30 -n 1) / 10)" | bc)
        
        cat >> "test_batch_${batch_id}.json" << EOF
    {
        "time": "$current_time",
        "license_plate": "$license_plate",
        "imei": "$(printf "%015d" $((RANDOM % 999999999999999 + 100000000000000)))",
        "imsi": "$(printf "%015d" $((RANDOM % 999999999999999 + 460000000000000)))",
        "longitude": $longitude,
        "latitude": $latitude,
        "altitude": $((RANDOM % 1000 + 1)),
        "speed": $speed,
        "gps_speed": $gps_speed,
        "direction": $direction,
        "mileage": $((RANDOM % 500000 + 10000)),
        "gps_status": "A",
        "is_moving": $([ $speed -gt 0 ] && echo "true" || echo "false"),
        "is_speeding": $([ $speed -gt 80 ] && echo "true" || echo "false"),
        "csq": $csq,
        "driver_id": "DRIVER-$(printf "%03d" $((RANDOM % 999 + 1)))",
        "raw_data": {
            "io": {
                "ignition": $ignition,
                "engine_on": $engine_on,
                "door_open": $([ $((RANDOM % 10)) -gt 8 ] && echo "true" || echo "false"),
                "brake": $([ $speed -eq 0 ] && echo "true" || echo "false"),
                "accelerator": $((speed > 0 ? RANDOM % 100 : 0))
            },
            "deviceStatus": {
                "battery_voltage": $battery_voltage,
                "internal_battery": $((RANDOM % 100 + 1)),
                "temperature": $((RANDOM % 50 + 10)),
                "gps_satellites": $((RANDOM % 12 + 4))
            },
            "sensors": {
                "fuel_level": $fuel_level,
                "engine_temp": $((RANDOM % 100 + 70)),
                "rpm": $((speed > 0 ? RANDOM % 3000 + 800 : 0)),
                "acceleration_x": $(echo "scale=2; ($(shuf -i -200-200 -n 1)) / 100" | bc),
                "acceleration_y": $(echo "scale=2; ($(shuf -i -200-200 -n 1)) / 100" | bc),
                "acceleration_z": $(echo "scale=2; 9.8 + ($(shuf -i -50-50 -n 1)) / 100" | bc)
            }
        }
    }$([ $i -lt $batch_size ] && echo "," || echo "")
EOF
    done

    cat >> "test_batch_${batch_id}.json" << EOF
]
EOF
}

echo "📝 生成測試數據..."
for ((i=1; i<=CONCURRENT_CONNECTIONS; i++)); do
    generate_test_data $RECORDS_PER_BATCH $i &
done
wait

echo "✅ 測試數據生成完成"

# 性能監控函數
monitor_performance() {
    echo "📊 開始性能監控..."
    
    # 創建監控日誌
    echo "timestamp,cpu_usage,memory_usage,disk_io,connections" > performance_log.csv
    
    while true; do
        timestamp=$(date +"%Y-%m-%d %H:%M:%S")
        
        # CPU 使用率
        cpu_usage=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//' || echo "0")
        
        # 記憶體使用率  
        memory_usage=$(vm_stat | grep "Pages active" | awk '{print $3}' | sed 's/\.//' || echo "0")
        
        # 磁碟 I/O（簡化）
        disk_io=$(iostat -d 1 1 | tail -1 | awk '{print $3}' || echo "0")
        
        # 資料庫連接數（如果可用）
        connections=$(curl -s "http://localhost:3000/health" >/dev/null && echo "OK" || echo "ERROR")
        
        echo "$timestamp,$cpu_usage,$memory_usage,$disk_io,$connections" >> performance_log.csv
        
        sleep 5
    done &
    
    MONITOR_PID=$!
}

# 啟動性能監控
monitor_performance

# 主要壓測函數
run_load_test() {
    local worker_id=$1
    local results_file="worker_${worker_id}_results.log"
    
    echo "⚡ Worker $worker_id 開始測試..."
    
    local iterations=$((TEST_DURATION / 10))
    local success_count=0
    local error_count=0
    local total_time=0
    
    for ((j=1; j<=iterations; j++)); do
        start_time=$(date +%s.%N)
        
        # 發送請求
        response=$(curl -X POST "$API_ENDPOINT" \
                       -H "Content-Type: application/json" \
                       -d @"test_batch_${worker_id}.json" \
                       -w "%{http_code};%{time_total}" \
                       -s)
        
        end_time=$(date +%s.%N)
        request_time=$(echo "$end_time - $start_time" | bc)
        
        # 解析響應
        http_code=$(echo "$response" | tail -c 10 | cut -d';' -f1)
        curl_time=$(echo "$response" | tail -c 10 | cut -d';' -f2)
        
        if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
            success_count=$((success_count + 1))
            total_time=$(echo "$total_time + $request_time" | bc)
            echo "Worker $worker_id - Iteration $j: SUCCESS (${request_time}s)" >> "$results_file"
        else
            error_count=$((error_count + 1))
            echo "Worker $worker_id - Iteration $j: ERROR $http_code" >> "$results_file"
        fi
        
        # 控制請求頻率（每 10 秒一次批次）
        sleep 10
    done
    
    # 計算統計
    if [ $success_count -gt 0 ]; then
        avg_time=$(echo "scale=3; $total_time / $success_count" | bc)
    else
        avg_time=0
    fi
    
    echo "Worker $worker_id 完成: $success_count 成功, $error_count 錯誤, 平均時間: ${avg_time}s" >> "$results_file"
}

echo "🔥 開始壓力測試..."

# 啟動所有 worker
for ((i=1; i<=CONCURRENT_CONNECTIONS; i++)); do
    run_load_test $i &
done

# 等待所有 worker 完成
wait

# 停止性能監控
kill $MONITOR_PID 2>/dev/null || true

echo "📈 生成測試報告..."

# 統計結果
total_success=0
total_errors=0
total_avg_time=0

for ((i=1; i<=CONCURRENT_CONNECTIONS; i++)); do
    if [ -f "worker_${i}_results.log" ]; then
        worker_stats=$(tail -1 "worker_${i}_results.log")
        success=$(echo "$worker_stats" | grep -o '[0-9]\+ 成功' | cut -d' ' -f1)
        errors=$(echo "$worker_stats" | grep -o '[0-9]\+ 錯誤' | cut -d' ' -f1)
        avg_time=$(echo "$worker_stats" | grep -o '[0-9]\+\.[0-9]\+s' | sed 's/s//')
        
        total_success=$((total_success + success))
        total_errors=$((total_errors + errors))
        total_avg_time=$(echo "$total_avg_time + $avg_time" | bc)
    fi
done

overall_avg_time=$(echo "scale=3; $total_avg_time / $CONCURRENT_CONNECTIONS" | bc)
total_requests=$((total_success + total_errors))
success_rate=$(echo "scale=2; $total_success * 100 / $total_requests" | bc)

echo "🎯 測試結果摘要"
echo "=============================================="
echo "總請求數: $total_requests"
echo "成功請求: $total_success"
echo "失敗請求: $total_errors"
echo "成功率: ${success_rate}%"
echo "平均響應時間: ${overall_avg_time}s"
echo "估算 TPS: $(echo "scale=2; $total_success / $TEST_DURATION" | bc)"
echo "=============================================="

# 基於生產建議的評估
echo ""
echo "📋 基於生產建議的評估"
echo "=============================================="

# 響應時間評估（目標 P95 < 100ms）
if (( $(echo "$overall_avg_time < 0.1" | bc -l) )); then
    echo "✅ 響應時間: 優秀 (< 100ms 目標)"
else
    echo "⚠️  響應時間: 需要優化 (目標 < 100ms)"
fi

# 成功率評估（目標 > 95%）
if (( $(echo "$success_rate > 95" | bc -l) )); then
    echo "✅ 成功率: 優秀 (> 95%)"
else
    echo "⚠️  成功率: 需要優化 (目標 > 95%)"
fi

# TPS 評估（基於建議的閾值）
current_tps=$(echo "scale=0; $total_success / $TEST_DURATION" | bc)
if [ "$current_tps" -gt 1000 ]; then
    echo "✅ TPS: 優秀 ($current_tps TPS)"
elif [ "$current_tps" -gt 500 ]; then
    echo "⚠️  TPS: 可接受 ($current_tps TPS)"
else
    echo "❌ TPS: 需要優化 ($current_tps TPS, 建議 > 1000)"
fi

echo "=============================================="
echo "📁 詳細結果文件:"
echo "   - performance_log.csv (系統性能監控)"
echo "   - worker_*_results.log (各 worker 詳細結果)"
echo ""
echo "🔧 優化建議:"
echo "   1. 檢查資料庫連接池配置"
echo "   2. 驗證批次大小是否合適"
echo "   3. 監控 WAL 增長率"
echo "   4. 檢查索引使用情況"

# 清理
cd ..
echo "🧹 測試完成，測試數據保留在 ./test-data/ 目錄"
