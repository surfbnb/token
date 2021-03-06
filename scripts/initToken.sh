
testName='Relevant'
testDecimals=18
testSymbol='REL'
testVersion='v1'
testDevFundAddress='0x6e1D15c98742d981E76fe3982027C48D8303C136'
initRoundReward=2500 #back to original
initRoundRewardBNString=$(echo "$initRoundReward*10^18" | bc)
timeConstant=$(echo "8760*10^18/l(2)" | bc -l)
timeConstantBNString=$(printf "%.0f\n" $timeConstant)
targetInflation=10880216701148
targetRound=26704
roundLength=240
roundDecayBNString=999920876739935000
totalPremintBNString=27777044629743800000000000 #back to original

args=$(echo $testName,$testDecimals,$testSymbol,$testVersion,$testDevFundAddress,$initRoundRewardBNString,$timeConstantBNString,$targetInflation,$targetRound,$roundLength,$roundDecayBNString,$totalPremintBNString)
echo $args
npx zos create RelevantToken --init initialize --args $args --network rinkeby
