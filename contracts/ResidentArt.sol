// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @dev Original black/lime mascot emblems and immutable on-chain metadata.
library ResidentArt {
    using Strings for uint256;

    function residentName(uint256 id) internal pure returns (string memory) {
        string[15] memory flies = ["VECTOR", "BYTE", "ZIP", "PIXEL", "GLITCH", "PATCH", "ECHO", "PULSE", "QUARK", "SPARK", "LOOP", "TRACE", "NOVA", "ORBIT", "FLUX"];
        string[15] memory frogs = ["RIPPLE", "LEAP", "DEPTH", "MOSS", "PEBBLE", "REED", "DRIFT", "FERN", "DEW", "BROOK", "LAGOON", "LOTUS", "CLOVER", "MIST", "POND"];
        return id % 2 == 1 ? flies[(id - 1) / 2] : frogs[(id - 1) / 2];
    }

    function expression(uint256 id) internal pure returns (string memory) {
        string[5] memory names = ["Sly", "Bold", "Chill", "Wild", "Focused"];
        return names[((id - 1) / 2) % 5];
    }

    function accessory(uint256 id) internal pure returns (string memory) {
        uint256 tier = (id - 1) / 10;
        return tier == 0 ? "Spectacles" : tier == 1 ? "Visor" : "Headphones";
    }

    function svg(uint256 id) internal pure returns (string memory) {
        bool fly = id % 2 == 1;
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800">',
            '<rect width="640" height="800" fill="#080a06"/>',
            '<g fill="#ccff00" font-family="monospace" font-weight="bold">',
            '<text x="42" y="58" font-size="14" letter-spacing="3">DEGEN VILLAGE</text>',
            '<text x="598" y="58" text-anchor="end" font-size="14">',id < 10 ? "0" : "",id.toString(),' / 30</text>',
            '<path d="M42 83H598" fill="none" stroke="#ccff00" stroke-width="2"/>',
            '<text x="42" y="109" font-size="10" letter-spacing="3">FIRST RESIDENTS / ',fly ? "SWARM" : "POND",'</text></g>',
            '<circle cx="320" cy="380" r="237" fill="none" stroke="#ccff00" stroke-width="13"/>',
            fly ? flyBody() : frogBody(),
            eyes(id, fly), headgear(id, fly),
            '<g font-family="monospace" font-weight="bold" text-anchor="middle" fill="#ccff00">',
            '<text x="320" y="700" font-size="38" letter-spacing="7">',residentName(id),'</text>',
            '<text x="320" y="738" font-size="11" letter-spacing="2">',fly ? "FLY" : "FROG",' / ',expression(id),' / ',accessory(id),'</text>',
            '<text x="320" y="770" font-size="9" letter-spacing="4">BOT PFP / GENESIS 001</text></g></svg>'
        );
    }

    function frogBody() private pure returns (string memory) {
        return string.concat(
            '<g fill="#ccff00" stroke="#080a06" stroke-width="9" stroke-linejoin="round">',
            '<path d="M244 439L190 452L144 513L161 539L241 535L276 490Z"/>',
            '<path d="M396 439L450 452L496 513L479 539L399 535L364 490Z"/>',
            '<path d="M239 415L401 415L420 486L384 545L257 532L224 486Z"/>',
            '<path d="M190 339L191 276L223 244L271 250L294 278L352 278L379 249L426 252L451 285L450 339L471 382L439 435L322 469L206 437L169 383Z"/>',
            '<path d="M206 437L322 469L439 435L424 452L322 489L221 458Z"/></g>',
            '<path d="M211 342L240 315L278 320L318 340L361 318L403 320L432 348L414 400L321 429L226 401Z" fill="#080a06"/>',
            '<path d="M286 484L321 497L356 484M194 507L214 487M445 507L425 487" fill="none" stroke="#080a06" stroke-width="9" stroke-linecap="round"/>',
            '<path d="M300 406Q319 420 340 403Q322 435 300 406" fill="#ccff00"/>',
            '<path d="M268 547L244 557M370 551L394 562" stroke="#ccff00" stroke-width="10" stroke-linecap="round"/>'
        );
    }

    function flyBody() private pure returns (string memory) {
        return string.concat(
            '<g fill="#080a06" stroke="#ccff00" stroke-width="10" stroke-linejoin="round">',
            '<path d="M275 400L202 315L148 313L130 342L157 405L256 439Z"/>',
            '<path d="M365 400L438 315L492 313L510 342L483 405L384 439Z"/></g>',
            '<path d="M152 341L254 410M488 341L386 410" stroke="#ccff00" stroke-width="7"/>',
            '<g fill="none" stroke="#ccff00" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">',
            '<path d="M264 431L212 459L190 494M258 463L225 496L231 527M280 491L268 540L251 555"/>',
            '<path d="M376 431L428 459L450 494M382 463L415 496L409 527M360 491L372 540L389 555"/></g>',
            '<path d="M271 405L369 405L390 468L366 519L320 550L274 519L250 468Z" fill="#ccff00" stroke="#080a06" stroke-width="10" stroke-linejoin="round"/>',
            '<path d="M265 452L320 467L375 452M269 485L320 500L371 485M292 518L320 527L348 518" fill="none" stroke="#080a06" stroke-width="13"/>',
            '<path d="M284 271L269 228L247 214M356 271L371 228L393 214" fill="none" stroke="#ccff00" stroke-width="11" stroke-linecap="round"/>',
            '<circle cx="247" cy="214" r="13" fill="#ccff00"/><circle cx="393" cy="214" r="13" fill="#ccff00"/>',
            '<path d="M227 278L282 266L320 292L358 266L413 278L442 327L422 388L375 408L320 436L265 408L218 388L198 327Z" fill="#ccff00" stroke="#080a06" stroke-width="10" stroke-linejoin="round"/>',
            '<path d="M237 304L277 290L311 321L303 378L266 388L231 367L218 332Z" fill="#080a06"/>',
            '<path d="M403 304L363 290L329 321L337 378L374 388L409 367L422 332Z" fill="#080a06"/>',
            '<path d="M303 402Q320 415 337 400Q321 433 303 402" fill="#080a06"/>'
        );
    }

    function eyes(uint256 id, bool fly) private pure returns (string memory) {
        uint256 mood = ((id - 1) / 2) % 5;
        string memory pupils = string.concat(
            '<g fill="#ccff00"><ellipse cx="266" cy="359" rx="22" ry="27"/><ellipse cx="374" cy="359" rx="22" ry="27"/></g>',
            '<g fill="#080a06"><path d="M267 337L280 341L276 363L263 366L258 356Z"/>',
            '<path d="M361 342L374 336L382 354L377 367L364 363Z"/></g>'
        );
        string memory lids = mood == 0 ? '<path d="M235 327L293 351L296 329ZM344 333L404 319L401 342Z"/>' :
            mood == 1 ? '<path d="M235 323L295 339L292 326ZM345 326L404 323L402 340Z"/>' :
            mood == 2 ? '<path d="M238 328H295V355H238ZM345 328H402V355H345Z"/>' :
            mood == 3 ? '<path d="M237 324L294 337L292 320ZM346 348L403 328L405 349Z"/>' :
            '<path d="M237 324L296 354L296 329ZM344 329L403 324L344 354Z"/>';
        return string.concat('<g',fly ? ' transform="translate(0 -14)"' : '', '>',pupils,'<g fill="#080a06">',lids,'</g></g>');
    }

    function headgear(uint256 id, bool fly) private pure returns (string memory) {
        uint256 tier = (id - 1) / 10;
        if (tier == 0) return string.concat(
            '<g fill="none" stroke="#ccff00" stroke-width="7" stroke-linejoin="round"',fly ? ' transform="translate(0 -14)"' : '', '>',
            '<path d="M238 330L291 339L291 384L241 386L231 371ZM349 338L402 327L409 370L396 385L349 383ZM291 349L320 343L349 348"/></g>'
        );
        if (tier == 1) return '<path d="M206 300L228 266L389 256L437 290L348 313L226 315Z" fill="#080a06" stroke="#ccff00" stroke-width="8" stroke-linejoin="round"/><path d="M246 287L371 278M348 313L448 291" stroke="#ccff00" stroke-width="8"/>';
        return '<path d="M188 352V295L219 251L271 232H369L421 251L452 295V352" fill="none" stroke="#080a06" stroke-width="23"/><path d="M188 352V295L219 251L271 232H369L421 251L452 295V352" fill="none" stroke="#ccff00" stroke-width="10" stroke-linejoin="round"/><g fill="#ccff00" stroke="#080a06" stroke-width="7"><path d="M175 327L201 319L212 373L187 389L175 378ZM465 327L439 319L428 373L453 389L465 378Z"/></g><path d="M452 378V407L383 425" fill="none" stroke="#ccff00" stroke-width="9"/><path d="M361 417L388 414L393 432L367 437Z" fill="#ccff00" stroke="#080a06" stroke-width="5"/>';
    }

    function metadata(uint256 id) internal pure returns (string memory) {
        string memory json = string.concat(
            '{"name":"',residentName(id),' / First Residents #',id.toString(),'",',
            '"description":"An original DEGEN VILLAGE bot PFP skin. 30 black-and-lime mascot emblems: 15 flies and 15 frogs. Free mint, network gas only. Cosmetic profile avatar; no trading advantage. Artwork and metadata live entirely on-chain.",',
            '"image":"data:image/svg+xml;base64,',Base64.encode(bytes(svg(id))),'",',
            '"attributes":[{"trait_type":"Species","value":"',id % 2 == 1 ? "Fly" : "Frog",'"},',
            '{"trait_type":"Palette","value":"Black / Lime"},',
            '{"trait_type":"Accessory","value":"',accessory(id),'"},',
            '{"trait_type":"Resident","value":"',residentName(id),'"},',
            '{"display_type":"number","trait_type":"Edition","value":',id.toString(),'},',
            '{"trait_type":"Expression","value":"',expression(id),'"}]}'
        );
        return string.concat("data:application/json;base64,",Base64.encode(bytes(json)));
    }
}
