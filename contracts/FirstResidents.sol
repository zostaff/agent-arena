// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ResidentArt} from "./ResidentArt.sol";

/// @notice Thirty free game souvenirs. Only network gas is paid by minters.
contract FirstResidents is ERC721 {
    uint256 public constant MAX_SUPPLY = 30;
    uint256 public totalSupply;
    mapping(address => bool) public hasMinted;
    bool private minting;

    error SoldOut();
    error AlreadyMinted();
    error MintInProgress();

    constructor() ERC721("DEGEN VILLAGE: First Residents", "DVFR") {}

    /// @dev Nonpayable, no administrator and no reserve allocation.
    function mint() external returns (uint256 tokenId) {
        if (minting) revert MintInProgress();
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (totalSupply == MAX_SUPPLY) revert SoldOut();
        minting = true;
        hasMinted[msg.sender] = true;
        tokenId = ++totalSupply;
        _safeMint(msg.sender, tokenId);
        minting = false;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return ResidentArt.metadata(tokenId);
    }
}
