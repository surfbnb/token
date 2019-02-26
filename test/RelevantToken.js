const zos = require('zos');

const { TestHelper } = zos;
console.log(TestHelper);

const RelevantToken = artifacts.require('RelevantToken');

const chai = require('chai');

const { expect } = chai;
const BN = require('bignumber.js');
chai.use(require('chai-bignumber')(BN));

const { fromWei } = web3.utils;

contract('token', accounts => {
  let token;
  let retOwner;
  let retContractBalance;
  let retCurationRewards;
  let retDevFund;
  let retDevFundBalance;
  let retTotalReleased;
  let retTotalSupply;
  let inflationRewards;
  let totalReleased;
  let lastRoundRewardDecay;

  // define contract parameters (TODO: automate tests for different parameters)
  const testName = 'Relevant Token';
  const testDecimals = 18;
  const p = 1e18;
  const testSymbol = 'RVT';
  const testVersion = '1.0';
  const testDevFundAddress = accounts[0];
  const halfLife = 8760; // # of rounds to decay by half
  let timeConstant = (halfLife / Math.LN2) * p;
  const targetInflation = 10880216701148;
  let initRoundReward = 2500 * p;
  const roundLength = 1; // 240;
  let roundDecay = 999920876739935000;
  const targetRound = 26704;
  let totalPremint = 27777044629743800000000000;

  // transform big number parameters for contract initialization
  // (ugh is there a better way to do this?)
  let initRoundRewardBNString = new BN(initRoundReward.toString())
    .toFixed(0)
    .toString();
  let timeConstantBNString = new BN(timeConstant.toString())
    .toFixed(0)
    .toString();
  let totalPremintBNString = new BN(totalPremint.toString())
    .toFixed(0)
    .toString();
  let roundDecayBNString = new BN(roundDecay.toString()).toFixed(0).toString();

  // compute total rewards using loops with discrete decay factor
  const calcTotalRewards = roundNum => {
    let roundReward;
    let rewardsSum;
    if (roundNum < targetRound) {
      roundReward = initRoundReward;
      rewardsSum = roundReward;
      for (let i = 0; i < roundNum; i++) {
        roundReward *= roundDecay / p;
        rewardsSum += roundReward;
      }
      return rewardsSum / p;
    }
    let roundsPassedSinceConst = roundNum - targetRound;
    let totalTokens = totalPremint;
    for (let i = 0; i <= roundsPassedSinceConst; i++) {
      roundReward = (totalTokens * targetInflation) / p;
      totalTokens += roundReward;
    }
    return totalTokens / p;
  };

  // get total released tokens from contract in comparable format
  const getReleasedTokens = async () => {
    retTotalReleased = await token.totalReleased();
    const result = fromWei(retTotalReleased.toString());
    return result;
  };

  // calculate total premint
  const totalInflationRewards = calcTotalRewards(targetRound);
  console.log('Total Rewards', totalInflationRewards);
  console.log('totalPremint', totalPremint / p);

  // calculate rewards and compare with released rewards from contract
  const testForRounds = async (lastRound, currentRound) => {
    console.log(`COMPARING FOR ROUNDS ${lastRound + 1} to ${currentRound}`);
    await token.setRoundNum(currentRound);
    if (lastRound !== 0) {
      lastRoundRewardDecay = new BN(
        (initRoundReward * (roundDecay / p) ** lastRound).toString()
      )
        .toFixed(0)
        .toString();
      totalReleased = new BN((calcTotalRewards(lastRound) * p).toString())
        .toFixed(0)
        .toString();
      await token.setLastRound(lastRound, lastRoundRewardDecay, totalReleased);
      // if (lastRound === targetRound) {
      //   await token.setLastRound(lastRound, lastRoundReward, totalPremintBNString);
      // }
    }

    await token.releaseTokens();
    totalReleased = await getReleasedTokens();
    inflationRewards = calcTotalRewards(currentRound);
    console.log('computed: ', inflationRewards.toString());
    console.log('released: ', totalReleased.toString());
    expect(totalReleased).to.be.bignumber.above(inflationRewards - 0.00001);
    expect(totalReleased).to.be.bignumber.below(inflationRewards + 0.00001);
  };

  before(async () => {
    token = await RelevantToken.new();
    expect(token.address).to.exist;
    await token.initialize(
      testName,
      testDecimals,
      testSymbol,
      testVersion,
      testDevFundAddress,
      initRoundRewardBNString,
      timeConstantBNString,
      targetInflation,
      targetRound,
      roundLength,
      roundDecayBNString,
      totalPremintBNString
    );
  });

  it('Returns expected parameters on initialization', async () => {
    retOwner = await token.owner();
    expect(retOwner.toString()).to.equal(accounts[0]);
  });

  it('Premints the total inflation rewards for decay phase', async () => {
    retContractBalance = await token.balanceOf(token.address);
    retTotalSupply = await token.totalSupply();
    expect(retContractBalance.toString()).to.equal(totalPremintBNString);
    expect(retTotalSupply.toString()).to.equal(totalPremintBNString);
  });

  it('Computes rewards correctly at the start of decay phase', async () => {
    totalReleased = await testForRounds(0, 1);
    await testForRounds(0, 24);
    await testForRounds(0, 100);
    await testForRounds(0, 500);
  });

  it('Computes rewards correctly in the middle and end of the decay phase', async () => {
    const decayMiddleCheck = Math.round(targetRound / 2);
    const decayEndCheck = targetRound - 300;
    await testForRounds(decayMiddleCheck, decayMiddleCheck + 1);
    await testForRounds(decayMiddleCheck, decayMiddleCheck + 100);
    await testForRounds(decayMiddleCheck, decayMiddleCheck + 500);
    await testForRounds(decayEndCheck, decayEndCheck + 5);
    await testForRounds(decayEndCheck, decayEndCheck + 100);
  });

  it('Computes rewards correctly when crossing from decay to constant phase', async () => {
    await testForRounds(targetRound - 1, targetRound);
    await testForRounds(targetRound - 1, targetRound + 10);
    await testForRounds(targetRound - 5, targetRound + 5);
  });

  it('Computes rewards correctly in the constant inflation phase', async () => {
    const constMiddleCheck = targetRound + 500;
    await testForRounds(targetRound, targetRound + 1);
    await testForRounds(constMiddleCheck, constMiddleCheck + 100);
  });

  it('Releases rewards into buckets and transfers devFund to devFundAddress', async () => {
    retTotalReleased = await token.totalReleased();
    // take 1/5 and 4/5
    retCurationRewards = await token.rewardFund();
    expect(retCurationRewards / p).to.be.above(0);
    retDevFund = await token.developmentFund();
    expect(retDevFund / p).to.equal(0);
    retDevFundBalance = await token.balanceOf(testDevFundAddress);
    console.log(
      'totalReleased',
      (retTotalReleased / p).toString(),
      'devFundBalance',
      (retDevFundBalance / p).toString()
    );
    expect(retDevFundBalance / p).to.be.above(0);
  });
});

// TODO: add tests for upgradeability (https://docs.zeppelinos.org/docs/testing.html)
