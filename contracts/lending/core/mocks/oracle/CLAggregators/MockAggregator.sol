// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

contract MockAggregator {
    int256 private _latestAnswer;
    uint256 private _latestRound;

    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );

    constructor(int256 initialAnswer) {
        _latestAnswer = initialAnswer;
        _latestRound = 0;
        emit AnswerUpdated(initialAnswer, 0, block.timestamp);
    }

    function setLatestAnswer(int256 answer) external {
        _latestAnswer = answer;
        _latestRound += 1;
        emit AnswerUpdated(answer, _latestRound, block.timestamp);
    }

    function latestAnswer() external view returns (int256) {
        return _latestAnswer;
    }

    function getTokenType() external pure returns (uint256) {
        return 1;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}
