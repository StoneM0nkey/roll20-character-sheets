// --- ALL SHEET WORKERS START --- //
const PLAYER = 'player';
const SHEET_WORKER = 'sheetworker';

const SUCCESS = 1;
const INFO = 2;
const WARNING = 3;
const ERROR = 4;

const BOOK_FIELDS = [
    'book-phb','book-tcfhb','book-tcthb','book-tcprhb','book-tcwhb','book-psionics',
    'book-tom','book-aaeg',
    'book-dwarves','book-bards','book-elves','book-humanoids','book-rangers',
    'book-paladins','book-druids','book-barbarians','book-necromancers','book-ninjas',
    'book-combat-and-tactics','book-skills-and-powers','book-spells-and-magic'
];

const LEVEL_FIELDS = {
    'level-class1': 'class1',
    'level-class2': 'class2',
    'level-class3': 'class3',
    'level-class4': 'class4',
    'level-class5': 'class5',
};

const SCHOOL_SPELLS_AND_MAGIC = 'school-spells-and-magic';
const SCHOOL_FIELDS = [SCHOOL_SPELLS_AND_MAGIC];

const SPHERE_SPELLS_AND_MAGIC = 'sphere-spells-and-magic';
const SPHERE_FIELDS = ['sphere-druids', 'sphere-necromancers', SPHERE_SPELLS_AND_MAGIC];

class RollTemplateBuilder {
    constructor(template) {
        this.template = template;
        this.builder = [];
    }

    push(args) {
        if (Array.isArray(args)) {
            this.builder = this.builder.concat(args);
        } else {
            for (let i = 0; i < arguments.length; i++) {
                this.builder.push(arguments[i]);
            }
        }
    }

    string() {
        return `&{template:${this.template}} ${this.builder.map(s => `{{${s}}}`).join(' ')}`;
    }
}

//#region Helper function
const isSheetWorkerUpdate = function (eventInfo) {
    return eventInfo.sourceType === SHEET_WORKER;
}

const isPlayerUpdate = function (eventInfo) {
    return eventInfo.sourceType === PLAYER;
}

const capitalizeFirst = function (s) {
    if (typeof s !== 'string')
        return '';

    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const displaySize = function(size) {
    if (typeof size !== 'string' || size.length === 0)
        return '';

    let sizeLetter = size.charAt(0).toLowerCase();
    switch (sizeLetter) {
        case 't': return 'Tiny';
        case 's': return 'Small';
        case 'm': return 'Medium';
        case 'l': return 'Large';
        case 'h': return 'Huge';
        case 'g': return 'Gargantuan';
        default: return capitalizeFirst(size);
    }
}

const sizeToInt = function(size) {
    if (typeof size !== 'string' || size.length === 0)
        return '';

    let sizeLetter = size.charAt(0).toLowerCase();
    switch (sizeLetter) {
        case 't': return 0;
        case 's': return 1;
        case 'm': return 2;
        case 'l': return 3;
        case 'h': return 4;
        case 'g': return 5;
    }
}

const displayWeaponType = function (type) {
    if (typeof type !== 'string' || type.length === 0)
        return '';

    let typeLetter = type.toLowerCase();
    switch (typeLetter) {
        case 's': return 'Slashing';
        case 'p': return 'Piercing';
        case 'b': return 'Bludgeoning';
        default: return capitalizeFirst(type);
    }
}

const parseSourceAttribute = function (eventInfo) {
    let parse = {};
    if (eventInfo.sourceAttribute.startsWith('repeating')) {
        let split = eventInfo.sourceAttribute.split('_');
        parse.section = split[1];
        parse.rowId = split[2];
        parse.attribute = split[3];
    } else {
        parse.attribute = eventInfo.sourceAttribute;
    }
    return parse;
}

const conditionalLog = function (bool, msg) {
    if (bool)
        console.log(msg);
}

const extractQueryResult = async function(query){//Sends a message to query the user for some behavior, returns the selected option.
    let queryRoll = await startRoll(`!{{query=[[0[response=${query}]]]}}`);
    finishRoll(queryRoll.rollId);
    return queryRoll.results.query.expression.replace(/^.+?response=|\]$/g,'');
};

const extractRoll = async function(rollExpression) {
    let queryRoll = await startRoll(`!{{roll=[[${rollExpression}]]}}`);
    finishRoll(queryRoll.rollId);
    return queryRoll.results.roll;
};

const extractRollResult = async function(rollExpression) {
    let roll = await extractRoll(rollExpression);
    return roll.result;
};

// Call this when an async function does not call the CRP to keep the reference to the character sheet.
const keepContextRoll = async function () {
    let dummyRoll = await startRoll('!{{roll=}}');
    finishRoll(dummyRoll.rollId);
}

const printRoll = async function(rollExpression) {
    let roll = await startRoll(rollExpression);
    finishRoll(roll.rollId);
}

const isRollValid = function (rollExpression, field) {
    let expression = rollExpression.trim();
    if (!expression)
        return false;

    let message = `In the field @{${field}} you have unmatched opening and closing`;

    let openPara = (expression.match(/\(/g) || []).length
    let closePara = (expression.match(/\)/g) || []).length
    if (openPara !== closePara) {
        showToast(ERROR, 'Unmatched Parenthesis', `${message} parenthesis. You have:\n${openPara}x '('\n${closePara}x ')'`);
        return false;
    }

    let openCurly = (expression.match(/{/g) || []).length
    let closeCurly = (expression.match(/}/g) || []).length
    if (openCurly !== closeCurly) {
        showToast(ERROR, 'Unmatched Curly brackets', `${message} curly brackets. You have:\n${openCurly}x '{'\n${closeCurly}x '}'`);
        return false;
    }

    let openSquare = (expression.match(/\[/g) || []).length
    let closeSquare = (expression.match(/]/g) || []).length
    if (openSquare !== closeSquare) {
        showToast(ERROR, 'Unmatched Square brackets', `${message} square brackets. You have:\n${openSquare}x '['\n${closeSquare}x ']'`);
        return false;
    }

    if (openSquare % 2 !== 0) {
        showToast(ERROR, 'Square brackets error', `The field @{${field}} have too few square brackets. Square brackets are used in pairs of two, ie. [[ ]].\nThe expression have an uneven number of bracket pairs: ${openSquare}`);
        return false;
    }

    return true;
}

const LEVEL_CLASS_REGEX = /@\{level-class[1-5]}/g;
const checkClassLevel = async function(values, rollExpression) {
    await keepContextRoll();
    let match = rollExpression.match(LEVEL_CLASS_REGEX);
    if (!match)
        return rollExpression; // There is no scaling

    let levelsInExpression = new Set(match);
    if (levelsInExpression.size > 1)
        return rollExpression; // The user presumably knows what he is doing

    let levelsWithValues = Object.keys(LEVEL_FIELDS).filter(level => values[level]);
    if (levelsWithValues.length === 0)
        return rollExpression; // The user has not set levels in any fields

    let [levelInExpression] = levelsInExpression; // first element from set
    let levelInExpressionNoBrackets = levelInExpression.replace(/[@{}]/g, '');
    if (levelsWithValues.length === 1) {
        if (levelInExpressionNoBrackets === levelsWithValues[0]) {
            return rollExpression;
        } else {
            return  rollExpression.replaceAll(levelInExpressionNoBrackets, levelsWithValues[0]);
        }
    } else {
        let suggestedClasses = levelsWithValues.map(l => `${values[LEVEL_FIELDS[l]].replaceAll(',', '')} (${l}),${l}`)
            .join('|');
        let query = values[levelInExpressionNoBrackets]
            ? `?{Please confirm the class to use|${suggestedClasses}}`
            : `?{${levelInExpressionNoBrackets} has no value. Please select the class to use|${suggestedClasses}}`;

        let field = await extractQueryResult(query);
        return rollExpression.replaceAll(levelInExpressionNoBrackets, field);
    }
}

const calculateFormula = function(formulaField, calculatedField, doCheckClassLevel) {
    getAttrs([formulaField, ...Object.entries(LEVEL_FIELDS).flat()], async function (values) {
        let rollExpression = values[formulaField];
        let valid = isRollValid(rollExpression, formulaField);
        if (!valid)
            return;

        let valueToSet = {};
        if (doCheckClassLevel) {
            let updatedRollExpression = await checkClassLevel(values, rollExpression);
            if (rollExpression !== updatedRollExpression) {
                valueToSet[formulaField] = rollExpression = updatedRollExpression;
            }
        }

        if (calculatedField) {
            valueToSet[calculatedField] = await extractRollResult(rollExpression);
        }

        if (Object.keys(valueToSet).length > 0) {
            setAttrs(valueToSet);
        }
    });
}

const getToastObject = function (type, title, message) {
    return {
        ['toast']: 1,
        ['toast-content']: type,
        ['toast-title']: title,
        ['toast-message']: message
    }
}

const showToast = function(type, title, message) {
    setAttrs(getToastObject(type, title, message));
}

const getActiveSettings = function (settingFields, values) {
    let settings = settingFields.map(bField => values[bField])
        .filter(Boolean)
        .filter(book => book !== '0');
    return new Set(settings);
}

const isBookInactive = function (books, obj) {
    let activeBooks = getActiveSettings(BOOK_FIELDS, books);
    if (Array.isArray(obj))
        return obj.every(b => !activeBooks.has(b));
    else
        return !activeBooks.has(obj['book']);
}

const bookInactiveGetToastObject = function (books, obj) {
    let bookInactive = isBookInactive(books, obj);
    let result = null;
    if (bookInactive) {
        if (Array.isArray(obj)) {
            let booksString = obj.map(b => '\n* ' + b).join('')
            result = getToastObject(ERROR, 'Missing Book(s)', `The book(s):${booksString}\nAre currently not active on your sheet.\nGo to the *Sheet Settings* and activate any of the listed book(s) (if your DM allows for its usage)`);
        } else {
            result = getToastObject(ERROR, 'Missing Book', `The book *${obj['book']}* is currently not active on your sheet.\nGo to the *Sheet Settings* and activate the book (if your DM allows for its usage)`);
        }
    }
    return result;
}

const bookInactiveShowToast = function(books, obj) {
    let bookInactive = isBookInactive(books, obj);
    if (bookInactive) {
        if (Array.isArray(obj)) {
            let booksString = obj.map(b => '\n* ' + b).join('')
            showToast(ERROR, 'Missing Book(s)', `The book(s):${booksString}\nAre currently not active on your sheet.\nGo to the *Sheet Settings* and activate any of the listed book(s) (if your DM allows for its usage)`);
        } else {
            showToast(ERROR, 'Missing Book', `The book *${obj['book']}* is currently not active on your sheet.\nGo to the *Sheet Settings* and activate the book (if your DM allows for its usage)`);
        }
    }
    return bookInactive;
};

const isRemoving0 = function(eventInfo, fieldNames) {
    return fieldNames.some(fieldName => !parseInt(eventInfo.removedInfo[`${eventInfo.sourceAttribute}_${fieldName}`]));
};

const isOverwriting0 = function(eventInfo) {
    return !parseInt(eventInfo.newValue) && !parseInt(eventInfo.previousValue);
};

const doEarlyReturn = function(eventInfo, fieldNames) {
    return eventInfo.removedInfo
        ? isRemoving0(eventInfo, fieldNames)
        : isOverwriting0(eventInfo);
};

const repeatingMultiplySum = function(section, valueField, multiplierField, destination, decimals) {
    TAS.repeating(section)
        .attr(destination)
        .field([valueField, multiplierField])
        .reduce(function(m, r) {
            return m + r.F[valueField] * r.F[multiplierField];
        }, 0, function(t,r,a) {
            let dec = parseInt(decimals);
            if (isNaN(dec)) {
                a[destination] = t;
            } else {
                a.D[dec][destination] = t;
            }
        })
        .execute();
};
const repeatingCalculateRemaining = function(repeatingName, repeatingFieldsToSum, totalField, remainingField) {
    TAS.repeating(repeatingName)
        .attrs([totalField, remainingField])
        .fields(repeatingFieldsToSum)
        .reduce(function (memo, row) {
            repeatingFieldsToSum.forEach(column => {
                memo += row.I[column];
            });
            return memo;
        }, 0, function (memo,_,attrSet) {
            attrSet.I[remainingField] = attrSet.I[totalField] - memo;
        }).execute();
};

const repeatingCalculateRemainingRecursive = function (tail, accumulator, resultFieldName) {
    let head = tail.shift();
    if (!head) {
        setAttrs({
            [resultFieldName] : accumulator
        });
        return;
    }

    TAS.repeating(head.section)
        .fields(head.slotsField)
        .each(function (r) {
            accumulator -= r.I[head.slotsField];
        })
        .execute(() => repeatingCalculateRemainingRecursive(tail, accumulator, resultFieldName));
};
//#endregion

//#region Generic Setup functions
const setupStaticCalculateTotal = function(totalField, fieldsToSum, maxValue) {
    let onChange = fieldsToSum.map(field => `change:${field}`).join(' ');
    on(onChange, function () {
        getAttrs(fieldsToSum, function (values) {
            let total = 0;
            fieldsToSum.forEach(field => {
                total += parseInt(values[field]) || 0;
            });

            if (!isNaN(maxValue))
                total = Math.min(total, maxValue);

            setAttrs({
                [totalField]: total
            });
        });
    });
}

function setupRepeatingRowCalculateTotal(repeatingTotalField, repeatingFieldsToSum, repeatingName, maxValue) {
    let onChange = repeatingFieldsToSum.map(field => `change:repeating_${repeatingName}:${field}`).join(' ');
    let allFields = [...repeatingFieldsToSum];
    allFields.push(repeatingTotalField);
    on(`${onChange} remove:repeating_${repeatingName}`, function(eventInfo){
        if (eventInfo.removedInfo)
            return;

        TAS.repeating(repeatingName)
            .fields(allFields)
            .tap(function(rowSet) {
                let rowId = parseSourceAttribute(eventInfo).rowId;
                let row = rowSet[rowId];
                let total = 0;
                repeatingFieldsToSum.forEach(column => {
                    total += row.I[column];
                });

                if (!isNaN(maxValue))
                    total = Math.min(total, maxValue);

                row[repeatingTotalField] = total;
            })
            .execute();
    });
}
//#endregion

on('clicked:hide-toast', function(eventInfo) {
    setAttrs({
        ['toast']: 0,
        ['toast-content']: 0,
    });
});

//#region Ability Scores logic
// Ability Score Parser function
const EXCEPTIONAL_STRENGTH_REGEX = /18[\[(]([0-9]{1,3})[\])]/; // Ie. 18[65], 18(65)
function getLookupValue(abilityScoreString, defaultValue, isStrength = false) {
    if (abilityScoreString === '') {
        return defaultValue;
    }

    let abilityScoreNumber = parseInt(abilityScoreString);
    if (isNaN(abilityScoreNumber) || abilityScoreNumber < 1 || abilityScoreNumber > 25) {
        return 0; // Return error value
    }

    if (isStrength) {
        let exceptionalMatch = abilityScoreString.match(EXCEPTIONAL_STRENGTH_REGEX);
        if (exceptionalMatch !== null) {
            let exceptionalStrNumber = parseInt(exceptionalMatch[1]);
            if (1 <= exceptionalStrNumber && exceptionalStrNumber <= 50) {
                return '18[01-50]';
            }
            if (51 <= exceptionalStrNumber && exceptionalStrNumber <= 75) {
                return '18[51-75]'
            }
            if (76 <= exceptionalStrNumber && exceptionalStrNumber <= 90) {
                return '18[76-90]'
            }
            if (91 <= exceptionalStrNumber && exceptionalStrNumber <= 99) {
                return '18[91-99]'
            }
            // 100 can be written as [00] or [100]
            if (exceptionalStrNumber === 0 || exceptionalStrNumber === 100) {
                return '18[00]'
            }
        }
    }

    return abilityScoreNumber;
}

//Set sub-attributes based on Strength, Stamina, and Muscle
on('change:strength change:stamina change:muscle', function() {
    getAttrs(['strength','stamina','muscle'], function(values) {
        let strengthRaw = values.strength.replace(/\s+/g, '');
        let staminaRaw = values.stamina.replace(/\s+/g, '');
        let muscleRaw = values.muscle.replace(/\s+/g, '');

        let strength = getLookupValue(strengthRaw, '', true);
        if (strength === '') {
            return;
        }

        if (strength === 0) {
            assignStr(0,0, strengthTable['strnotes'][0], strengthTable['str2notes'][0]);
            return;
        }

        let stamina = getLookupValue(staminaRaw, strength, true);
        let muscle = getLookupValue(muscleRaw, strength, true);

        let strnotes;
        let str2notes;
        if (staminaRaw === '' && muscleRaw === '') {
            strnotes = [strengthTable['str2notes'][strength], strengthTable['strnotes'][strength]].filter(Boolean).join(', ');
            str2notes = '';
        } else {
            strnotes = stamina === 0 ? 'INVALID STAMINA' : strengthTable['strnotes'][strength];
            str2notes = muscle === 0 ? 'INVALID MUSCLE' : strengthTable['str2notes'][muscle];
        }

        assignStr(stamina, muscle, strnotes, str2notes);

        function assignStr(stamina, muscle, strnotes, str2notes) {
            setAttrs({
                strengthhit: strengthTable['strengthhit'][muscle],
                strengthdmg: strengthTable['strengthdmg'][muscle],
                carryweight: strengthTable['carryweight'][stamina],
                maxpress: strengthTable['maxpress'][muscle],
                opendoor: strengthTable['opendoor'][muscle],
                bendbar: strengthTable['bendbar'][muscle],
                strnotes: strnotes,
                str2notes: str2notes,
            });
        }
    });
});

// Set sub-attributes based on Dexterity, Aim, and Balance
on('change:dexterity change:aim change:balance', function() {
    getAttrs(['dexterity','aim','balance'], function(values) {
        let dexterityRaw = values.dexterity.replace(/\s+/g, '');
        let aimRaw = values.aim.replace(/\s+/g, '');
        let balanceRaw = values.balance.replace(/\s+/g, '');

        let dexterity = getLookupValue(dexterityRaw, '');
        if (dexterity === '') {
            return;
        }

        if (dexterity === 0) {
            assignAttributes(0, 0, 0, dexterityTable['dexnotes'][0], dexterityTable['dexnotes'][0], false);
            return;
        }

        let aim = getLookupValue(aimRaw, '');
        let balance = getLookupValue(balanceRaw, '');

        let dexnotes;
        let dex2notes;
        let standardRules = false;
        if (aimRaw === '' && balanceRaw === '') {
            dexnotes = '';
            dex2notes = '';
            standardRules = true;
        } else {
            dexnotes = aim === 0 ? 'INVALID AIM' : '';
            dex2notes = balance === 0 ? 'INVALID BALANCE' : '';
        }

        assignAttributes(dexterity, aim, balance, dexnotes, dex2notes, standardRules);

        function assignAttributes(dexterity, aim, balance, dexnotes, dex2notes, standardRules) {
            setAttrs({
                ppd: dexterityTable['aim-pickpocket'][aim] || dexterityTable['dex-pickpocket'][dexterity],
                old: dexterityTable['aim-openlocks'][aim] || dexterityTable['dex-openlocks'][dexterity],
                rtd: dexterityTable['dex-findtraps'][dexterity],
                msd: dexterityTable['balance-movesilently'][balance] || dexterityTable['dex-movesilently'][dexterity],
                hsd: dexterityTable['dex-hideinshadows'][dexterity],
                cwd: standardRules ? '0' : dexterityTable['balance-climbwalls'][balance] || dexterityTable['dex-climbwalls'][dexterity],
                tud: standardRules ? '0' : dexterityTable['dex-tunneling'][dexterity],
                ebd: standardRules ? '0' : dexterityTable['dex-escapebonds'][dexterity],
                dexreact: dexterityTable['dexreact'][getLookupValue(balance, dexterity)],
                dexmissile: dexterityTable['dexmissile'][getLookupValue(aim, dexterity)],
                dexdefense: dexterityTable['dexdefense'][getLookupValue(balance, dexterity)],
                dexnotes: dexnotes,
                dex2notes: dex2notes,
            });
        }
    });
});

// Set sub-attributes based on Constitution, Health, and Fitness
on('change:constitution change:health change:fitness', function() {
    getAttrs(['constitution','health','fitness'], function(values) {
        let constitutionRaw = values.constitution.replace(/\s+/g, '');
        let healthRaw = values.health.replace(/\s+/g, '');
        let fitnessRaw = values.fitness.replace(/\s+/g, '');

        let constitution = getLookupValue(constitutionRaw, '');
        if (constitution === '') {
            return;
        }

        if (constitution === 0) {
            assignAttributes(0,0, 0, constitutionTable['connotes'][0], constitutionTable['con2notes'][0]);
            return;
        }

        let health = getLookupValue(healthRaw, constitution);
        let fitness = getLookupValue(fitnessRaw, constitution);

        let connotes;
        let con2notes;
        if (healthRaw === '' && fitnessRaw === '') {
            connotes = [constitutionTable['con2notes'][constitution], constitutionTable['connotes'][constitution]].filter(Boolean).join(', ');
            con2notes = '';
        } else {
            connotes = health === 0 ? 'INVALID HEALTH' : constitutionTable['connotes'][constitution];
            con2notes = fitness === 0 ? 'INVALID FITNESS' : constitutionTable['con2notes'][fitness];
        }

        assignAttributes(constitution, health, fitness, connotes, con2notes);

        function assignAttributes(constitution, health, fitness, connotes, con2notes) {
            setAttrs({
                conadj: constitutionTable['conadj'][fitness],
                conshock: constitutionTable['conshock'][health],
                conres: constitutionTable['conres'][fitness],
                conpoisonsave: constitutionTable['conpoisonsave'][health],
                conregen: constitutionTable['conregen'][constitution],
                connotes: connotes,
                con2notes: con2notes,
            });
        }
    });
});

// Set sub-attributes based on Intelligence, Reason, and Knowledge
on('change:intelligence change:reason change:knowledge', function() {
    getAttrs(['intelligence','reason','knowledge'], function(values) {
        let intelligenceRaw = values.intelligence.replace(/\s+/g, '');
        let reasonRaw = values.reason.replace(/\s+/g, '');
        let knowledgeRaw = values.knowledge.replace(/\s+/g, '');

        let intelligence = getLookupValue(intelligenceRaw, '');
        if (intelligence === '') {
            return;
        }

        if (intelligence === 0) {
            assignAttributes(0, 0, 0, intelligenceTable['intnotes'][0], intelligenceTable['intnotes'][0]);
            return;
        }

        let reason = getLookupValue(reasonRaw, intelligence);
        let knowledge = getLookupValue(knowledgeRaw, intelligence);

        let intnotes;
        let int2notes;
        if (reasonRaw === '' && knowledgeRaw === '') {
            intnotes = intelligenceTable['intnotes'][intelligence];
            int2notes = '';
        } else {
            intnotes = reason === 0 ? 'INVALID REASON' : '';
            int2notes = knowledge === 0 ? 'INVALID KNOWLEDGE' : intelligenceTable['intnotes'][knowledge];
        }

        assignAttributes(intelligence, reason, knowledge, intnotes, int2notes);

        function assignAttributes(intelligence, reason, knowledge, intnotes, int2notes) {
            setAttrs({
                intlang: intelligenceTable['intlang'][knowledge],
                intlvl: intelligenceTable['intlvl'][reason],
                intchance: intelligenceTable['intchance'][knowledge],
                intmax: intelligenceTable['intmax'][reason],
                intimm1st: intelligenceTable['intimm1st'][reason],
                intimm2nd: intelligenceTable['intimm2nd'][reason],
                intimm3rd: intelligenceTable['intimm3rd'][reason],
                intimm4th: intelligenceTable['intimm4th'][reason],
                intimm5th: intelligenceTable['intimm5th'][reason],
                intimm6th: intelligenceTable['intimm6th'][reason],
                intimm7th: intelligenceTable['intimm7th'][reason],
                intnotes: intnotes,
                int2notes: int2notes,
            });
        }
    });
});

// Set sub-attributes based on Wisdom, Intuition, and Willpower
async function parseWisBonus(abilityScore, wisdom) {
    let bonus = {
        '1st': 0,
        '2nd': 0,
        '3rd': 0,
        '4th': 0,
        '5th': 0,
        '6th': 0,
        '7th': 0,
        'wind': 0,
        'wisbonus': '—',
        'wisbonus-prime': '—',
        'wisbonus-extra': '—',
    };
    if (abilityScore < 13 && wisdom < 13) {
        await keepContextRoll();
        return bonus;
    }

    let answer = await extractQueryResult('?{Priests get bonus spells from high Wisdom (but not Paladins and Rangers). Do you play a priest?|My character is a priest,true|My character is a different class,false}');
    if (answer !== 'true') {
        return bonus;
    }

    // Combine all spell levels into one string
    let bonusString = '';
    for (let i = 13; i <= abilityScore; i++) {
        bonusString += wisdomTable['wisbonus'][i];
    }

    // Count instances of each spell level
    bonus = {
        '1st': (bonusString.match(/1st/g) || []).length,
        '2nd': (bonusString.match(/2nd/g) || []).length,
        '3rd': (bonusString.match(/3rd/g) || []).length,
        '4th': (bonusString.match(/4th/g) || []).length,
        '5th': (bonusString.match(/5th/g) || []).length,
        '6th': (bonusString.match(/6th/g) || []).length,
        '7th': (bonusString.match(/7th/g) || []).length,
        'wind': wisdomTable['wisdom-wind'][wisdom],
    };

    // Generate bonus prime and bonus extra strings
    function format(bonus, key) {
        if (bonus[key] === 0) {
            return '';
        }
        if (bonus[key] === 1) {
            return key
        }
        return `${bonus[key]}x${key}`;
    }
    bonus['wisbonus-prime'] = [format(bonus, '1st'), format(bonus, '2nd'), format(bonus, '3rd'), format(bonus, '4th')].filter(Boolean).join(', ');
    bonus['wisbonus-extra'] = [format(bonus, '5th'), format(bonus, '6th'), format(bonus, '7th')].filter(Boolean).join(', ');
    bonus['wisbonus'] = [bonus['wisbonus-prime'], bonus['wisbonus-extra']].filter(Boolean).join(', ');

    return bonus;
}

on('change:wisdom change:intuition change:willpower', function() {
    getAttrs(['wisdom','intuition','willpower'], async function (values) {
        let wisdomRaw = values.wisdom.replace(/\s+/g, '');
        let intuitionRaw = values.intuition.replace(/\s+/g, '');
        let willpowerRaw = values.willpower.replace(/\s+/g, '');

        let wisdom = getLookupValue(wisdomRaw, '');
        if (wisdom === '') {
            return;
        }

        let bonusSpells;
        if (wisdom === 0) {
            bonusSpells = await parseWisBonus(0, 0);
            assignAttributes(0, 0, 0, bonusSpells, wisdomTable['wisimmune'][0], wisdomTable['wisimmune'][0], wisdomTable['wisnotes'][0], wisdomTable['wisnotes'][0]);
            return;
        }

        let intuition = getLookupValue(intuitionRaw, wisdom);
        let willpower = getLookupValue(willpowerRaw, wisdom);

        let wisimm1;
        let wisimm2;
        let wisnotes;
        let wis2notes;
        if (intuitionRaw === '' && willpowerRaw === '') {
            wisnotes = wisdomTable['wisnotes'][wisdom];
            wis2notes = '';
            wisimm2 = '';
            let wisImmuneArray = [];
            for (let i = wisdom; i > 18; i--) {
                wisImmuneArray.push(wisdomTable['wisimmune'][i]);
            }
            wisimm1 = wisImmuneArray.filter(Boolean).join(', ');
        } else {
            wisnotes = intuition === 0 ? 'INVALID INTUITION' : wisdomTable['wisnotes'][intuition];
            wis2notes = willpower === 0 ? 'INVALID WILLPOWER' : wisdomTable['wisnotes'][willpower];
            let wisImmuneArray = [];
            for (let i = willpower; i > 18; i--) {
                wisImmuneArray.push(wisdomTable['wisimmune'][i]);
            }
            let slicePoint = Math.round(wisImmuneArray.length / 2);
            wisimm1 = wisImmuneArray.slice(0, slicePoint).filter(Boolean).join(', ');
            wisimm2 = wisImmuneArray.slice(slicePoint).filter(Boolean).join(', ');
        }
        bonusSpells = await parseWisBonus(intuition, wisdom);

        assignAttributes(wisdom, intuition, willpower, bonusSpells, wisimm1, wisimm2, wisnotes, wis2notes);

        function assignAttributes(wisdom, intuition, willpower, bonusSpells, wisimm1, wisimm2, wisnotes, wis2notes) {
            let newValue = {};
            newValue['wisdef'] = wisdomTable['wisdef'][willpower];
            newValue['wisbonus'] = bonusSpells['wisbonus'];
            newValue['wisbonus-prime'] = bonusSpells['wisbonus-prime'];
            newValue['wisbonus-extra'] = bonusSpells['wisbonus-extra'];
            newValue['wisfail'] = wisdomTable['wisfail'][intuition];
            newValue['wisimm'] = wisimm1;
            newValue['wisimm1'] = wisimm1;
            newValue['wisimm2'] = wisimm2;
            newValue['wisnotes'] = wisnotes;
            newValue['wis2notes'] = wis2notes;
            newValue['spell-priest-level1-wisdom'] = bonusSpells['1st'];
            newValue['spell-priest-level2-wisdom'] = bonusSpells['2nd'];
            newValue['spell-priest-level3-wisdom'] = bonusSpells['3rd'];
            newValue['spell-priest-level4-wisdom'] = bonusSpells['4th'];
            newValue['spell-priest-level5-wisdom'] = bonusSpells['5th'];
            newValue['spell-priest-level6-wisdom'] = bonusSpells['6th'];
            newValue['spell-priest-level7-wisdom'] = bonusSpells['7th'];
            newValue['wisdom-wind'] = bonusSpells['wind'];
            setAttrs(newValue);
        }
    });
});

// Set sub-attributes based on Charisma, Leadership, and Appearance
on('change:charisma change:leadership change:appearance', function() {
    getAttrs(['charisma','leadership','appearance'], function(values) {
        let charismaRaw = values.charisma.replace(/\s+/g, '');
        let leadershipRaw = values.leadership.replace(/\s+/g, '');
        let appearanceRaw = values.appearance.replace(/\s+/g, '');

        let charisma = getLookupValue(charismaRaw, '');
        if (charisma === '') {
            return;
        }

        if (charisma === 0) {
            assignAttributes(0,0, 0, charismaTable['chanotes'][0], charismaTable['chanotes'][0]);
            return;
        }

        let leadership = getLookupValue(leadershipRaw, charisma);
        let appearance = getLookupValue(appearanceRaw, charisma);

        let chanotes;
        let cha2notes;
        if (leadershipRaw === '' && appearanceRaw === '') {
            chanotes = charismaTable['chanotes'][charisma];
            cha2notes = '';
        } else {
            chanotes = leadership === 0 ? 'INVALID LEADERSHIP' : charismaTable['chanotes'][leadership];
            cha2notes = appearance === 0 ? 'INVALID APPEARANCE' : charismaTable['chanotes'][appearance];
        }

        assignAttributes(charisma, leadership, appearance, chanotes, cha2notes);

        function assignAttributes(charisma, leadership, appearance, chanotes, cha2notes) {
            setAttrs({
                chamax: charismaTable['chamax'][leadership],
                chaloy: charismaTable['chaloy'][leadership],
                chareact: charismaTable['chareact'][appearance],
                chanotes: chanotes,
                cha2notes: cha2notes,
            });
        }
    });
});

on('clicked:opendoor-check', function (eventInfo){
   getAttrs(['opendoor'], async function (values){
       let match = values.opendoor.match(/(\d+)\((\d+)\)/);
       let rollBuilder = new RollTemplateBuilder('2Echeck');
       rollBuilder.push('character=@{character_name}','checkroll=[[1d20cs1cf20]]','color=blue','success=The door swings open!');
       if (!match) {
           rollBuilder.push('checkvs=Open Doors Check','checktarget=[[@{opendoor}]]','fail=The door stays shut, but you can try again.');
           return printRoll(rollBuilder.string());
       }
       let target = await extractQueryResult(`?{What kind of door?|Normal door,${match[1]}|Locked / Barred / Magical door,${match[2]}}`);
       rollBuilder.push(`checktarget=[[${target}]]`);
       if (target === match[1]) {
           rollBuilder.push('checkvs=Open Normal Doors Check','fail=The door stays shut, but you can try again.');
       } else {
           rollBuilder.push('checkvs=Open Locked/Barred/Magically Held Doors Check','fail=The door stays shut. No further attempts can be made by @{character_name}.');
       }
       return printRoll(rollBuilder.string());
   });
});
//#endregion

const CALCULATION_FIELDS = [
    { formulaField: 'rogue-level-base'},
    { formulaField: 'level-wizard'},
    { formulaField: 'level-priest'},
    { formulaField: 'thac0-base',            calculatedField: 'thac0-base-calc' },
    // Proficiencies
    { formulaField: 'weapprof-slots-total',  calculatedField: 'weapprof-slots-total-calc' },
    { formulaField: 'prof-slots-total',      calculatedField: 'prof-slots-total-calc' },
    // Psionics
    { formulaField: 'discipline-progress',   calculatedField: 'discipline-slots_max' },
    { formulaField: 'science-progress',      calculatedField: 'science-slots_max' },
    { formulaField: 'devotion-progress',     calculatedField: 'devotion-slots_max' },
    { formulaField: 'defense-mode-progress', calculatedField: 'defense-mode-slots_max' },
    { formulaField: 'psp-progress',          calculatedField: 'PSP_max' },
];
CALCULATION_FIELDS.forEach(({formulaField, calculatedField}) => {
    on(`change:${formulaField}`, function (eventInfo) {
        if (isSheetWorkerUpdate(eventInfo))
            return;

        let doCheckClassLevel = !!eventInfo.newValue; // conversion into a bool
        calculateFormula(formulaField, calculatedField, doCheckClassLevel);
    });
});

//#region Wizard and Priest Spells slot counting
function isNewSpellSection(section) {
    return section.startsWith('wiz') || section.startsWith('pri');
}

// --- Start summing numbers from repeating spells for wizard and priest --- //
function recursiveSpellSum(tail, acc, oldField, newField, resultFieldName) {
    let head = tail.shift();
    if (head === undefined) {
        console.log(`Summing ended. Final sum is ${acc}`);
        console.timeEnd('Summing time');
        setAttrs({
            [resultFieldName] : acc
        });
        return;
    }

    let repeatingName;
    let fieldName;
    if (isNewSpellSection(head)) {
        repeatingName = `spells-${head}`
        fieldName = newField;
    } else {
        repeatingName = `spells${head}`
        fieldName = `${oldField}${head}`
    }

    console.timeLog('Summing time');

    TAS.repeating(repeatingName)
        .fields(fieldName)
        .each(function (r) {
            acc += (r.I[fieldName]);
            console.log(`Recursion ${repeatingName} updated sum to ${acc}`);
        })
        .execute(() => recursiveSpellSum(tail, acc, oldField, newField, resultFieldName)); // Fat arrow function to lazy load value.
}

function setupRepeatingSpellSumming(sections, oldField, newField, resultFieldName) {
    sections.forEach(section => {
        let repeatingName;
        let fieldName;
        if (isNewSpellSection(section)) {
            repeatingName = `spells-${section}`
            fieldName = newField;
        } else {
            repeatingName = `spells${section}`
            fieldName = `${oldField}${section}`
        }

        let onChange = `change:repeating_${repeatingName}:${fieldName} remove:repeating_${repeatingName}`;
        on(onChange, function (eventInfo) {
            if (doEarlyReturn(eventInfo, [fieldName]))
                return;

            console.log(`Summing started by section ${repeatingName}. Fieldname ${fieldName}`);
            console.time('Summing time');
            let levelsCopy = [...sections];
            let accumulator = 0;

            recursiveSpellSum(levelsCopy, accumulator, oldField, newField, resultFieldName);
        });
    });
}

function setupCalculateRemaining(totalField, sumField, remainingField) {
    on(`change:${totalField} change:${sumField}`, function (eventInfo) {
        getAttrs([totalField, sumField], function (values) {
            let intTotal = parseInt(values[totalField]) || 0;
            let intSum = parseInt(values[sumField]) || 0;

            console.log(`Setting ${remainingField} with value from ${totalField}: ${intTotal} and ${sumField}: ${intSum}`);

            setAttrs({
                [remainingField]: intTotal - intSum
            });
        });
    });
}
//#endregion

//#region Priest Spells based on Spheres
const ELEMENTAL = 'Elemental';
const PRIEST_SPHERES = [
    // Player's Handbook
    'All','Animal','Astral','Charm','Combat','Creation','Divination',ELEMENTAL,'Guardian','Healing',
    'Necromantic','Plant','Protection','Summoning','Sun','Weather',
    // Tome of Magic Spheres
    'Chaos','Law','Numbers','Thought','Time','Travelers','War','Wards'
];

const PRIMARY_SPHERE_REGEX = new RegExp(PRIEST_SPHERES.join('|'), 'gi');
const NO_ELEMENTAL_REGEX = new RegExp(PRIEST_SPHERES.filter(s => s !== ELEMENTAL).join('|'), 'gi');
const ELEMENTAL_REGEX = /Earth|Air|Fire|Water/gi

function parseSpheres(spheresStrings, regex) {
    let spheres = new Set();
    spheresStrings.map(s => s.match(regex))
        .flat()
        .filter(Boolean)
        .map(s => capitalizeFirst(s))
        .forEach(s => spheres.add(s));
    return spheres;
}

const getSpellSchools = function (spell, books) {
    let schoolRules = getActiveSettings(SCHOOL_FIELDS, books);
    return schoolRules.has(SCHOOL_SPELLS_AND_MAGIC)
        ? spell[SCHOOL_SPELLS_AND_MAGIC] || spell['school']
        : spell['school'];
}

const getSpellSpheres = function (spell, sphereRules) {
    if (sphereRules.has(SPHERE_SPELLS_AND_MAGIC))
        return spell[SPHERE_SPELLS_AND_MAGIC] || spell['sphere'];

    let sphere = spell['sphere'];
    sphereRules.forEach(rule => sphere += spell[rule] || '');
    return sphere;
}

function isSpellAvailable(spellName, spell, availableSpheres, elementalSpheres, activeBooks, optionalSpheres) {
    if (!activeBooks.has(spell['book']))
        return false;

    let spheres = getSpellSpheres(spell, optionalSpheres);

    let primarySpellSpheres = spheres.match(NO_ELEMENTAL_REGEX) || [];
    let isAvailable = primarySpellSpheres.some(sphere => availableSpheres.has(sphere));
    if (isAvailable)
        return true;

    if (!availableSpheres.has(ELEMENTAL))
        return false;

    if (!spheres.includes(ELEMENTAL))
        return false;

    if (spheres.includes(`${ELEMENTAL} (`))
        return spheres.match(ELEMENTAL_REGEX).some((element) => elementalSpheres.has(element))

    // The player and the spell has the elemental sphere (without any sub elements)
    // Currently only 'Commune With Nature' in the revised Player's Handbook (1995) has this property
    return true;
}

function setupAddPriestSpell(postfix) {
    if (!priestSpells[postfix])
        return;

    on(`clicked:add-spells-${postfix}`, function () {
        const section = `spells-${postfix}`;
        const field = 'spell-name';
        let sphereFields = ['sphere-major'];
        if (postfix.match(/[123]/))
            sphereFields.push("sphere-minor");

        TAS.repeating(section)
            .attrs([...sphereFields, ...BOOK_FIELDS, ...SPHERE_FIELDS])
            .fields(field)
            .reduce(function(knownSpells, row){
                knownSpells.add(row.S[field]);
                return knownSpells;
            }, new Set(), function (knownSpells,_,attrSet){
                let primarySpheres = parseSpheres(sphereFields.map(aField => attrSet.S[aField]), PRIMARY_SPHERE_REGEX);
                let elementalSpheres = parseSpheres(sphereFields.map(aField => attrSet.S[aField]), ELEMENTAL_REGEX);

                if (primarySpheres.size < 1) {
                    showToast(WARNING, 'No spheres found', `No valid spheres found. Please write or select some spheres`);
                    return;
                }

                let activeBooks = getActiveSettings(BOOK_FIELDS, attrSet);
                let optionalSpheres = getActiveSettings(SPHERE_FIELDS, attrSet);

                let spellsToAdd = [];
                for (const [spellName, spell] of Object.entries(priestSpells[postfix])) {
                    let isAvailable = isSpellAvailable(spellName, spell, primarySpheres, elementalSpheres, activeBooks, optionalSpheres);
                    if (isAvailable) {
                        spellsToAdd.push({name: spellName, book: spell['book']});
                    }
                }

                console.log(spellsToAdd);
                if (spellsToAdd.length < 1) {
                    showToast(ERROR, 'No spells found', `No spells found for the selected spheres`);
                    return;
                }

                spellsToAdd = spellsToAdd.filter(spell => !knownSpells.has(spell.name));
                console.log(spellsToAdd);
                if (spellsToAdd.length < 1) {
                    showToast(INFO, 'All spells added', `Found no more spells to add based on spheres`);
                    return;
                }

                let books = [...new Set(spellsToAdd.map(s => `\n • ${s.book}`))].join('');
                let toastObject = getToastObject(SUCCESS, 'Added new spells!', `Spells was added from the following books:${books}`);

                let newValue = {...toastObject};
                spellsToAdd.forEach(spell => {
                    let newrowid = generateRowID();
                    newValue[`repeating_${section}_${newrowid}_${field}`] = spell.name;
                });

                setAttrs(newValue);

            })
            .execute();
    });
}
//#endregion

//#region Wizard and Priest reset buttons
function resetCastSlots(row, castField, memField) {
    row.I[castField] = 0;
}

function resetCastAndMemSlots(row, castField, memField) {
    row.I[castField] = 0;
    row.I[memField] = 0;
}

function resetSpentSlots(row, castField, memField) {
    row.I[memField] = row.I[memField] - row.I[castField];
    row.I[castField] = 0;
}

function setupSpellSlotsReset(buttonName, tab, spellLevels, allSections) {
    let isPowers = !spellLevels || !tab;
    let attributes = ['spell-slot-reset-sections', 'spell-slot-reset-function']
    if (!isPowers)
        attributes.push(tab);

    on(`clicked:${buttonName}`, function () {

        getAttrs(attributes, function (values) {
            let resetSection = values['spell-slot-reset-sections'];
            let resetFunction = values['spell-slot-reset-function'];

            let sections = [];
            if (resetSection === 'all' || isPowers)
                sections = allSections;
            else if (resetSection === 'level') {
                let level = values[tab];
                if (!level)
                    return;

                let spellLevel = spellLevels.find(spellLevel => spellLevel.level === level);
                if (!spellLevel)
                    return;

                sections = spellLevel.sections || [];
            }

            if (!sections.length)
                return

            let updateFunction;
            if (resetFunction === '1' || isPowers)
                updateFunction = resetCastSlots;
            else if (resetFunction === '2')
                updateFunction = resetCastAndMemSlots;
            else if (resetFunction === '3')
                updateFunction = resetSpentSlots;

            if (!updateFunction)
                return;

            sections.forEach(section => {
                let repSection;
                let castField;
                let memField;
                if (isNewSpellSection(section)) {
                    repSection = `spells-${section}`;
                    castField = 'spell-cast-value';
                    memField = 'spell-memorized';
                } else {
                    repSection = `spells${section}`;
                    castField = `cast-value${section}`;
                    memField = `cast-max${section}`;
                }

                TAS.repeating(repSection)
                    .fields(castField, memField)
                    .each(function(row) {
                        updateFunction(row, castField, memField);
                    })
                    .execute();
            });
        });
    });
}
//#endregion

//#region Wizard and Priest spells and Powers setup
function setupAutoFillSpellInfo(section, spellsTable, optionalRulesFields) {
    if (!spellsTable[section])
        return;

    on(`change:repeating_spells-${section}:spell-name`, function (eventInfo) {
        let spell = spellsTable[section][eventInfo.newValue];
        if (!spell)
            return;

        let isPriest = section.startsWith('pri');
        let levelField = isPriest ? 'level-priest' : 'level-wizard';
        let className = isPriest ? 'Priest' : 'Wizard';

        getAttrs([...BOOK_FIELDS, ...optionalRulesFields, levelField], function(books) {
            if (bookInactiveShowToast(books, spell))
                return;

            let spellInfo = {
                [`repeating_spells-${section}_spell-cast-time`]    : spell['cast-time'],
                [`repeating_spells-${section}_spell-level`]        : displaySpellLevel(spell['level'], className),
                [`repeating_spells-${section}_spell-school`]       : getSpellSchools(spell, books),
                [`repeating_spells-${section}_spell-components`]   : spell['components'],
                [`repeating_spells-${section}_spell-range`]        : spell['range'],
                [`repeating_spells-${section}_spell-aoe`]          : spell['aoe'],
                [`repeating_spells-${section}_spell-duration`]     : spell['duration'],
                [`repeating_spells-${section}_spell-damage`]       : spell['damage'],
                [`repeating_spells-${section}_spell-damage-type`]  : spell['damage-type'],
                [`repeating_spells-${section}_spell-saving-throw`] : spell['saving-throw'],
                [`repeating_spells-${section}_spell-healing`]      : spell['healing'],
                [`repeating_spells-${section}_spell-materials`]    : spell['materials'],
                [`repeating_spells-${section}_spell-reference`]    : `${spell['reference']}, ${spell['book']}`,
                [`repeating_spells-${section}_spell-subtlety`]     : spell['subtlety'] || '',
                [`repeating_spells-${section}_spell-sensory`]      : spell['sensory'] || '',
                [`repeating_spells-${section}_spell-knockdown`]    : spell['knockdown'] || '',
                [`repeating_spells-${section}_spell-knockdown`]    : spell['knockdown'] || '',
                [`repeating_spells-${section}_spell-crit-size`]    : spell['crit-size'] || '',
                [`repeating_spells-${section}_spell-effect`]       : spell['effect']
            };

            if (isPriest) {
                let sphereRules = getActiveSettings(SPHERE_FIELDS, books);
                spellInfo[`repeating_spells-${section}_spell-sphere`] = getSpellSpheres(spell, sphereRules);
            }
            if (!books[levelField].trim()) {
                let toast = getToastObject(INFO, `Set ${className} caster level`, 'Almost every spell requires a caster level to calculate its effect. Without it most spells will fail and show and error in the chat');
                Object.assign(spellInfo, toast);
            }

            setAttrs(spellInfo);
        });
    });
}

const WIZARD_SPELL_LEVELS_SECTIONS = [
    {level: '1', sections: ['', '2', '3', 'wiz1']},
    {level: '2', sections: ['4', '5', '6', 'wiz2']},
    {level: '3', sections: ['7', '8', '9', 'wiz3']},
    {level: '4', sections: ['10', '11', '12', 'wiz4']},
    {level: '5', sections: ['70', '71', '72', 'wiz5']}, //... legacy naming convention
    {level: '6', sections: ['13', '14', '15', 'wiz6']},
    {level: '7', sections: ['16', '17', '18', 'wiz7']},
    {level: '8', sections: ['19', '20', '21', 'wiz8']},
    {level: '9', sections: ['22', '23', '24', 'wiz9']},
    {level: '10', sections: ['25', '26', '27', 'wiz10']},
    {level: '11', sections: ['52', '53', '54', 'wiz11']}, //... legacy naming convention
    {level: '12', sections: ['55', '56', '57', 'wiz12']},
    {level: '13', sections: ['58', '59', '60', 'wiz13']},
    {level: '14', sections: ['61', '62', '63', 'wiz14']},
    {level: '15', sections: ['64', '65', '66', 'wiz15']},
];

const PRIEST_SPELL_LEVELS_SECTIONS = [
    {level: '1', sections: ['28', '29', '30', 'pri1']},
    {level: '2', sections: ['31', '32', '33', 'pri2']},
    {level: '3', sections: ['34', '35', '36', 'pri3']},
    {level: '4', sections: ['37', '38', '39', 'pri4']},
    {level: '5', sections: ['40', '41', '42', 'pri5']},
    {level: '6', sections: ['43', '44', '45', 'pri6']},
    {level: '7', sections: ['46', '47', '48', 'pri7']},
    {level: 'q', sections: ['49', '50', '51', 'priq']},
];

const displaySpellLevel = function(level, className) {
    return level === 'q'
        ? 'Quest Spell Priest'
        : `Level ${level} ${className}`;
}

// --- Start setup Spell Slots --- //
WIZARD_SPELL_LEVELS_SECTIONS.forEach(spellLevel => {
    let prefix = `spell-level${spellLevel.level}`;
    setupStaticCalculateTotal(`${prefix}-total`, [`${prefix}-castable`, `${prefix}-specialist`, `${prefix}-misc`]);
    setupRepeatingSpellSumming(spellLevel.sections, 'cast-value', 'spell-cast-value', `${prefix}-cast-value-sum`);
    setupRepeatingSpellSumming(spellLevel.sections, 'cast-max', 'spell-memorized', `${prefix}-cast-max-sum`);
    setupCalculateRemaining(`${prefix}-total`, `${prefix}-cast-max-sum`, `${prefix}-selected`);
    setupCalculateRemaining(`${prefix}-total`, `${prefix}-cast-value-sum`, `${prefix}-remaining`);

    // Auto set spell info function
    let lastSection = spellLevel.sections[spellLevel.sections.length - 1];
    if (isNewSpellSection(lastSection)) {
        setupAutoFillSpellInfo(lastSection, wizardSpells, SCHOOL_FIELDS);
        setupSpellCrit(lastSection);
    }
});
setupAutoFillSpellInfo('wizmonster', wizardSpells, SCHOOL_FIELDS);
setupSpellCrit('wizmonster');

PRIEST_SPELL_LEVELS_SECTIONS.forEach(spellLevel => {
    let prefix = `spell-priest-level${spellLevel.level}`;
    setupStaticCalculateTotal(`${prefix}-total`, [`${prefix}-castable`, `${prefix}-wisdom`, `${prefix}-misc`]);
    setupRepeatingSpellSumming(spellLevel.sections, 'cast-value', 'spell-cast-value', `${prefix}-cast-value-sum`);
    setupRepeatingSpellSumming(spellLevel.sections, 'cast-max', 'spell-memorized', `${prefix}-cast-max-sum`);
    setupCalculateRemaining(`${prefix}-total`, `${prefix}-cast-max-sum`, `${prefix}-selected`);
    setupCalculateRemaining(`${prefix}-total`, `${prefix}-cast-value-sum`, `${prefix}-remaining`);

    // Auto set spell info function
    let lastSection = spellLevel.sections[spellLevel.sections.length - 1];
    if (isNewSpellSection(lastSection)) {
        setupAutoFillSpellInfo(lastSection, priestSpells, SPHERE_FIELDS);
        setupSpellCrit(lastSection);
        if (lastSection !== 'priq') {
            setupAddPriestSpell(lastSection);
        }
    }
});
setupAutoFillSpellInfo('primonster', priestSpells, SPHERE_FIELDS);
setupSpellCrit('primonster');
// --- End setup Spell Slots --- //

// --- Start setup Spell Points, Arc, and Wind --- //
const WIZARD_SPELL_POINTS = 'spell-points';
const TOTAL_ARC = 'total-arc';
const ALL_WIZARD_SPELL_SECTIONS = WIZARD_SPELL_LEVELS_SECTIONS.flatMap(sl => sl.sections);
setupStaticCalculateTotal(`${WIZARD_SPELL_POINTS}-total`, [`${WIZARD_SPELL_POINTS}-lvl`, `${WIZARD_SPELL_POINTS}-spc`, `${WIZARD_SPELL_POINTS}-int`]);
setupRepeatingSpellSumming(ALL_WIZARD_SPELL_SECTIONS, WIZARD_SPELL_POINTS, 'spell-points', `${WIZARD_SPELL_POINTS}-sum`, true);
setupRepeatingSpellSumming(ALL_WIZARD_SPELL_SECTIONS, 'arc', 'spell-arc', `${TOTAL_ARC}-sum`, true);
setupCalculateRemaining(`${WIZARD_SPELL_POINTS}-total`, `${WIZARD_SPELL_POINTS}-sum`, `${WIZARD_SPELL_POINTS}-remaining`);
setupCalculateRemaining(TOTAL_ARC, `${TOTAL_ARC}-sum`, `${TOTAL_ARC}-remaining`);
on('change:spell-points-int-enabled change:intelligence', function (eventInfo) {
    getAttrs(['spell-points-int-enabled', 'intelligence'], function (values) {
        let newValue = {'spell-points-int': 0}
        if (values['spell-points-int-enabled'] !== '1') {
            return setAttrs(newValue);
        }
        let intelligence = getLookupValue(values['intelligence'], 0);
        newValue['spell-points-int'] = intelligenceTable['spell-points-int'][intelligence];
        setAttrs(newValue);
    });
});

const PRIEST_SPELL_POINTS = 'spell-points-priest';
const TOTAL_WIND = 'total-wind';
const ALL_PRIEST_SPELL_SECTIONS = PRIEST_SPELL_LEVELS_SECTIONS.flatMap(sl => sl.sections);
setupStaticCalculateTotal(`${PRIEST_SPELL_POINTS}-total`, [`${PRIEST_SPELL_POINTS}-lvl`, `${PRIEST_SPELL_POINTS}-wis`]);
setupStaticCalculateTotal(TOTAL_WIND, ['level-wind', 'wisdom-wind']);
setupRepeatingSpellSumming(ALL_PRIEST_SPELL_SECTIONS, PRIEST_SPELL_POINTS, 'spell-points', `${PRIEST_SPELL_POINTS}-sum`, true);
setupRepeatingSpellSumming(ALL_PRIEST_SPELL_SECTIONS, 'wind', 'spell-wind', `${TOTAL_WIND}-sum`, true);
setupCalculateRemaining(`${PRIEST_SPELL_POINTS}-total`, `${PRIEST_SPELL_POINTS}-sum`, `${PRIEST_SPELL_POINTS}-remaining`);
setupCalculateRemaining(TOTAL_WIND, `${TOTAL_WIND}-sum`, `${TOTAL_WIND}-remaining`);
let PRIEST_SPELL_POINTS_WIS = 'spell-points-priest-wis';
on('change:spell-points-priest-wis-enabled change:wisdom change:level-priest', function (eventInfo) {
    getAttrs(['spell-points-priest-wis-enabled', 'wisdom', 'level-priest'], async function (values) {
        await keepContextRoll();
        let newValue = {};
        newValue[PRIEST_SPELL_POINTS_WIS] = 0;
        if (values['spell-points-priest-wis-enabled'] !== '1') {
            return setAttrs(newValue);
        }
        let wisdom = getLookupValue(values['wisdom'], 0);
        if (wisdom < 13) {
            return setAttrs(newValue);
        }
        if (wisdom === 13) {
            newValue[PRIEST_SPELL_POINTS_WIS] = 4;
            return setAttrs(newValue);
        }
        if (wisdom === 14) {
            newValue[PRIEST_SPELL_POINTS_WIS] = 8;
            return setAttrs(newValue);
        }

        let level = 1;
        if (values['level-priest'] === '') {
            return showToast(INFO, 'Set Priest caster level', 'The Priest\'s level is needed to calculate bonus Spell Points from high Wisdom.');
        } else {
            level = await extractRollResult(values['level-priest']);
        }
        if (isNaN(level) || level < 0) {
            level = 1;
        }
        let spellPoints = 0;
        if (wisdom === 15) {
            spellPoints = level < 3 ? 8 : 15;
        } else if (wisdom === 16) {
            spellPoints = level < 3 ? 8 : 20;
        } else if (wisdom === 17) {
            if (1 <= level && level <= 2) {
                spellPoints = 8;
            } else if (3 <= level && level <= 4) {
                spellPoints = 20;
            } else {
                spellPoints = 30;
            }
        } else if (wisdom === 18) {
            if (1 <= level && level <= 2) {
                spellPoints = 8;
            } else if (3 <= level && level <= 4) {
                spellPoints = 20;
            } else if (5 <= level && level <= 6) {
                spellPoints = 30;
            } else {
                spellPoints = 45;
            }
        } else if (wisdom >= 19) {
            if (1 <= level && level <= 2) {
                spellPoints = 12;
            } else if (3 <= level && level <= 4) {
                spellPoints = 25;
            } else if (5 <= level && level <= 6) {
                spellPoints = 45;
            } else {
                spellPoints = 60;
            }
        }

        newValue[PRIEST_SPELL_POINTS_WIS] = spellPoints;
        setAttrs(newValue);
    });
});
// --- End setup Spell Points, Arc, and Wind --- //

// --- Start setup reset buttons --- //
//tab6 = wizard levels
//tab7 = priest levels
setupSpellSlotsReset('reset-spent-slots-wiz', 'tab6', WIZARD_SPELL_LEVELS_SECTIONS, ALL_WIZARD_SPELL_SECTIONS);
let allPriestSectionsExceptQuest = PRIEST_SPELL_LEVELS_SECTIONS.slice(0, -1).flatMap(sl => sl.sections);
setupSpellSlotsReset('reset-spent-slots-pri', 'tab7', PRIEST_SPELL_LEVELS_SECTIONS, allPriestSectionsExceptQuest);
// --- End setup reset buttons --- //

// --- Start setup Granted Powers --- //
let powerSpellSections = ['67', '68', '69'];
let spellPower = 'spell-power';
setupRepeatingSpellSumming(powerSpellSections, 'cast-value', '', `${spellPower}-sum`);
setupRepeatingSpellSumming(powerSpellSections, 'cast-max', '', `${spellPower}-available`);
setupCalculateRemaining(`${spellPower}-available`, `${spellPower}-sum`, `${spellPower}-remaining`);
setupSpellSlotsReset('reset-spent-slots-pow', null, null, powerSpellSections)
// --- End setup Granted Powers --- //
//#endregion

//#region Rogue skills
// --- Start setup Rogue skills total --- //
let rogueStandardSkills = ['pp', 'ol', 'rt', 'ms', 'hs', 'dn', 'cw', 'rl', 'ib'];
let rogueStandardColumns = ['b', 'r', 'd', 'k', 'm', 'l'];
rogueStandardSkills.forEach(skill => {
    setupStaticCalculateTotal(`${skill}t-hidden`, rogueStandardColumns.map(column => `${skill}${column}`));
    setupStaticCalculateTotal(`${skill}t`, [`${skill}t-hidden`], 95);
    setupStaticCalculateTotal(`${skill}noarmort`, [`${skill}t-hidden`, `${skill}noarmorb`], 95);
    setupStaticCalculateTotal(`${skill}armort`, [`${skill}t-hidden`, `${skill}armorp`], 95);
});

// Setup custom rogue skills total
setupRepeatingRowCalculateTotal('crt-hidden', rogueStandardColumns.map(column => `cr${column}`), 'customrogue');
setupRepeatingRowCalculateTotal('crt', ['crt-hidden'], 'customrogue', 95);
setupRepeatingRowCalculateTotal('crnoarmort', ['crt-hidden', 'crnoarmorb'], 'customrogue', 95);
setupRepeatingRowCalculateTotal('crarmort', ['crt-hidden', 'crarmorp'], 'customrogue', 95);
// --- End setup Rogue skills total --- //

//Rogue armor modifier auto fill
on('change:armorname', function(eventInfo) {
    let armor = rogueArmor[eventInfo.newValue];
    if (armor === undefined)
        return;

    let armorModifiers = {
        'pparmorp': armor['Pick Pockets'],
        'olarmorp': armor['Open Locks'] || '-0',
        'rtarmorp': armor['Find/Remove Traps'] || '-0',
        'msarmorp': armor['Move Silently'] || '-0',
        'hsarmorp': armor['Hide in Shadows'] || '-0',
        'dnarmorp': armor['Detect Noise'],
        'cwarmorp': armor['Climb Walls'],
    };
    setAttrs(armorModifiers);
});
//Rogue Custom Skills level sum
on('change:repeating_customrogue:crl remove:repeating_customrogue', function(){

    TAS.repeating('customrogue')
        .attrs('newskill')
        .fields('crl')
        .reduce(function(m,r){
            m.crl+=(r.I.crl);
            return m;
        },{crl:0},function(m,r,a){
            a.newskill=m.crl;
        })
        .execute();
});
// --- End setup Rogue skills total --- //
//#endregion

//#region Weapons tab logic and autofil
on('change:nonprof-penalty', function (eventInfo){
    let nonprofRaw = parseInt(eventInfo.newValue) || 0;
    let nonprof = Math.abs(nonprofRaw) * -1;
    let famil = Math.floor(nonprof / 2)
    setAttrs({
        ['nonprof-penalty']: nonprof,
        ['famil-penalty']: famil
    },{silent:true});
});

on('change:thac0-base-calc', function(eventInfo) {
    TAS.repeating('weapons')
        .fields('ThAC0')
        .each(function (row) {
            if (`${row['ThAC0']}` === `${eventInfo.previousValue}`)
                row['ThAC0'] = eventInfo.newValue;
        })
        .execute();

    TAS.repeating('weapons2')
        .fields('ThAC02')
        .each(function (row) {
            if (`${row['ThAC02']}` === `${eventInfo.previousValue}`)
                row['ThAC02'] = eventInfo.newValue;
        })
        .execute();
});

async function selectVersion(foundObjects, values, comparer, objectName) {
    let activeBooks = getActiveSettings(BOOK_FIELDS, values);
    let activeObjects = foundObjects.filter(w => w['book'].some(b => activeBooks.has(b)));
    if (activeObjects.length === 0) {
        await keepContextRoll();
        let booksString = foundObjects.flatMap(w => w['book']).map(b => '\n* ' + b).join('');
        showToast(ERROR, 'Missing Book(s)', `The book(s):${booksString}\nAre currently not active on your sheet.\nGo to the *Sheet Settings* and activate any of the listed book(s) (if your DM allows for its usage)`);
        return;
    }

    let isPlayersOption = values[WEAPONS_PLAYERS_OPTION_FIELD] === '2';
    let isAllEqual = activeObjects.every(o => comparer(o, activeObjects[0], isPlayersOption));
    if (isAllEqual) {
        await keepContextRoll();
        return activeObjects[0];
    } else {
        activeObjects = combineBooks(activeObjects, comparer, isPlayersOption);
        let options = activeObjects
            .map((o, i) => `${o.book.join('/')},${i}`)
            .join('|');
        let answer = await extractRollResult(`?{Multiple versions of this ${objectName} exists. Please select a version|${options}}`);
        return activeObjects[answer];
    }
}

function combineBooks(activeObjects, comparer, isPlayersOptions) {
    // Copying fields from active object to avoid side effects being saved permanently
    let copyActiveObjects = activeObjects.map(e => {
        return {...e}
    });
    let copyArray = [...copyActiveObjects];

    copyActiveObjects.forEach(activeObject => {
        copyArray.forEach((copyObject, i) => {
            if (activeObject === copyObject) {
                delete copyArray[i];
                return;
            }
            if (!comparer(activeObject, copyObject, isPlayersOptions))
                return;

            activeObject['book'] = activeObject['book'].concat(copyObject['book']);
            delete copyActiveObjects[i];
        });
    });

    return copyActiveObjects.filter(Boolean);
}

//#region Weapons autofill
const WEAPONS_PLAYERS_OPTION_FIELD = 'tab81';
function setWeaponWithBonus(weaponName, setWeaponFunc, comparer, thac0Field, category) {
    if (!weaponName)
        return;

    weaponName = weaponName.toLowerCase();
    let fields = [...BOOK_FIELDS, WEAPONS_PLAYERS_OPTION_FIELD, thac0Field].filter(Boolean);
    getAttrs(fields, async function (values) {
        let bonus = 0;
        let baseWeapons = WEAPONS_TABLE[weaponName]
        if (!baseWeapons) {
            let match = weaponName.match(/\s*\+([0-9]+)\s*/);
            if (!match)
                return;

            let baseWeaponName1 = weaponName.replace(match[0], '');
            let baseWeaponName2 = weaponName.replace(match[0], ' ').trim();
            baseWeapons = WEAPONS_TABLE[baseWeaponName1] || WEAPONS_TABLE[baseWeaponName2];
            if (!baseWeapons)
                return;

            bonus = parseInt(match[1]);
            if (isNaN(bonus))
                return;
        }
        let weaponsInCategory = baseWeapons;
        if (category)
            weaponsInCategory = weaponsInCategory.filter(w => w['category'].includes(category));

        if (weaponsInCategory.length === 0)
            return;

        let baseWeapon = await selectVersion(weaponsInCategory, values, comparer, 'weapon');
        console.log(baseWeapon);
        if (!baseWeapon)
            return;

        let thac0 = parseInt(values[thac0Field]);
        thac0 = isNaN(thac0) ? 20 : thac0;

        let weapon = {
            ...baseWeapon,
            'thac0' : thac0,
        };
        if (bonus < 1) {
            weapon['bonus'] = '0';
            weapon['bonusInt'] = 0;
        } else {
            weapon['bonus'] = `+${bonus}`;
            weapon['bonusInt'] = bonus;
            weapon['speed'] = Math.max(weapon['speed'] - bonus, 0)
        }
        setWeaponFunc(weapon);
    });
}

//melee hit autofill
on('change:repeating_weapons:weaponname', function(eventInfo) {
    let comparer = function (weapon1, weapon2, isPlayersOption) {
        let compareFields = ['size','speed'];
        if (isPlayersOption)
            compareFields.push('reach');
        return compareFields.every(f => weapon1[f] === weapon2[f]) && _.isEqual(new Set(weapon1['type'].split('/')), new Set(weapon2['type'].split('/')));
    }
    let rowId = parseSourceAttribute(eventInfo).rowId;
    let setWeaponFunc = function (weapon) {
        let weaponInfo = {};
        weaponInfo[`repeating_weapons_${rowId}_attackadj`]       = weapon['bonus'];
        weaponInfo[`repeating_weapons_${rowId}_ThAC0`]           = weapon['thac0'];
        weaponInfo[`repeating_weapons_${rowId}_range`]           = weapon['reach'] || 'Melee';
        weaponInfo[`repeating_weapons_${rowId}_size`]            = weapon['size'];
        weaponInfo[`repeating_weapons_${rowId}_weapspeed`]       = weapon['speed'];
        weaponInfo[`repeating_weapons_${rowId}_weaptype-slash`]  = weapon['type'].includes('S') ? 1 : 0;
        weaponInfo[`repeating_weapons_${rowId}_weaptype-pierce`] = weapon['type'].includes('P') ? 1 : 0;
        weaponInfo[`repeating_weapons_${rowId}_weaptype-blunt`]  = weapon['type'].includes('B') ? 1 : 0;

        setAttrs(weaponInfo);
    };
    setWeaponWithBonus(eventInfo.newValue, setWeaponFunc, comparer, 'thac0-base-calc', 'Melee');
});

//melee damage autofill
on('change:repeating_weapons-damage:weaponname1', function(eventInfo) {
    let comparer = function (weapon1, weapon2, isPlayersOption) {
        let compareFields = ['small-medium','large'];
        if (isPlayersOption) {
            compareFields.push('size');
            compareFields.push('type');
            compareFields.push('knockdown');
        }
        return compareFields.every(f => weapon1[f] === weapon2[f])
    }
    let rowId = parseSourceAttribute(eventInfo).rowId;
    let setWeaponFunc = function (weapon) {
        let weaponInfo = {};
        weaponInfo[`repeating_weapons-damage_${rowId}_damadj`]     = weapon['bonus'];
        weaponInfo[`repeating_weapons-damage_${rowId}_damsm`]      = weapon['small-medium'];
        weaponInfo[`repeating_weapons-damage_${rowId}_daml`]       = weapon['large'];
        weaponInfo[`repeating_weapons-damage_${rowId}_knockdown1`] = weapon['knockdown'] || '';
        weaponInfo[`repeating_weapons-damage_${rowId}_size`]       = weapon['size'];
        weaponInfo[`repeating_weapons-damage_${rowId}_type`]       = weapon['type'];

        setAttrs(weaponInfo);
    };

    setWeaponWithBonus(eventInfo.newValue, setWeaponFunc, comparer, '', 'Melee');
});

//range hit autofill
on('change:repeating_weapons2:weaponname2', function(eventInfo) {
    let comparer = function (weapon1, weapon2, isPlayersOption) {
        return ['strength','rof','range','size','speed'].every(f => weapon1[f] === weapon2[f]) && _.isEqual(new Set(weapon1['type'].split('/')), new Set(weapon2['type'].split('/')));
    }
    let rowId = parseSourceAttribute(eventInfo).rowId;
    let setWeaponFunc = function (weapon) {
        let weaponInfo = {};
        weaponInfo[`repeating_weapons2_${rowId}_strbonus2`]        = weapon['strength'] ? 1 : 0;
        weaponInfo[`repeating_weapons2_${rowId}_attacknum2`]       = weapon['rof'] || '';
        weaponInfo[`repeating_weapons2_${rowId}_attackadj2`]       = weapon['bonus'];
        weaponInfo[`repeating_weapons2_${rowId}_ThAC02`]           = weapon['thac0'];
        weaponInfo[`repeating_weapons2_${rowId}_range2`]           = weapon['range'] || '';
        weaponInfo[`repeating_weapons2_${rowId}_size2`]            = weapon['size'];
        weaponInfo[`repeating_weapons2_${rowId}_weapspeed2`]       = weapon['speed'];
        weaponInfo[`repeating_weapons2_${rowId}_weaptype-slash2`]  = weapon['type'].includes('S') ? 1 : 0;
        weaponInfo[`repeating_weapons2_${rowId}_weaptype-pierce2`] = weapon['type'].includes('P') ? 1 : 0;
        weaponInfo[`repeating_weapons2_${rowId}_weaptype-blunt2`]  = weapon['type'].includes('B') ? 1 : 0;

        setAttrs(weaponInfo);
    };

    setWeaponWithBonus(eventInfo.newValue, setWeaponFunc, comparer, 'thac0-base-calc', 'Range');
});

//range damage autofill
on('change:repeating_ammo:ammoname', function(eventInfo) {
    let comparer = function (weapon1, weapon2, isPlayersOption) {
        let comparerFields = ['strength','small-medium','large'];
        let equalSets = true;
        if (isPlayersOption) {
            comparerFields.push('knockdown');
            comparerFields.push('size');
            comparerFields.push('ammo-size');
            equalSets = _.isEqual(new Set(weapon1['type'].split('/')), new Set(weapon2['type'].split('/')));
        }
        return comparerFields.every(f => weapon1[f] === weapon2[f]) && equalSets;
    }
    let rowId = parseSourceAttribute(eventInfo).rowId;
    let setWeaponFunc = function (weapon) {
        let weaponInfo = {};
        weaponInfo[`repeating_ammo_${rowId}_strbonus3`]  = weapon['strength'] ? 1 : 0;
        weaponInfo[`repeating_ammo_${rowId}_damadj2`]    = weapon['bonus'];
        weaponInfo[`repeating_ammo_${rowId}_damsm2`]     = weapon['small-medium'];
        weaponInfo[`repeating_ammo_${rowId}_daml2`]      = weapon['large'];
        weaponInfo[`repeating_ammo_${rowId}_knockdown2`] = weapon['knockdown'] || '';
        weaponInfo[`repeating_ammo_${rowId}_size`]       = weapon['ammo-size'] || weapon['size'];
        weaponInfo[`repeating_ammo_${rowId}_type`]       = weapon['type'];

        setAttrs(weaponInfo);
    }
    setWeaponWithBonus(eventInfo.newValue, setWeaponFunc, comparer, '', 'Range');
});

//Follower weapons
function setupFollowerWeaponsAutoFill(repeating, sections) {
    let comparer = function (weapon1, weapon2, isPlayersOption) {
        let comparerFields = ['rof','small-medium','large','range','speed'];
        if (isPlayersOption) {
            comparerFields.push('reach');
        }
        return comparerFields.every(f => weapon1[f] === weapon2[f]) && _.isEqual(new Set(weapon1['type'].split('/')), new Set(weapon2['type'].split('/')));
    }

    sections.forEach(section => {
        let changePrefix = repeating ? `repeating_${repeating}:` : '';
        on(`change:${changePrefix}weaponnamehench${section}`, function(eventInfo) {
            let repeatingRowPrefix = repeating ? `repeating_${repeating}_${parseSourceAttribute(eventInfo).rowId}_` : '';
            let setWeaponFunc = function (weapon) {
                let weaponInfo = {};
                weaponInfo[`${repeatingRowPrefix}attacknumhench${section}`] = weapon['rof'] || '1';
                weaponInfo[`${repeatingRowPrefix}attackadjhench${section}`] = weapon['bonus'];
                weaponInfo[`${repeatingRowPrefix}damadjhench${section}`]    = weapon['bonus'];
                weaponInfo[`${repeatingRowPrefix}damsmhench${section}`]     = weapon['small-medium'];
                weaponInfo[`${repeatingRowPrefix}damlhench${section}`]      = weapon['large'];
                weaponInfo[`${repeatingRowPrefix}rangehench${section}`]     = weapon['range'] || weapon['reach'] || 'Melee';
                weaponInfo[`${repeatingRowPrefix}weaptypehench${section}`]  = weapon['type'];
                weaponInfo[`${repeatingRowPrefix}weapspeedhench${section}`] = weapon['speed'];

                setAttrs(weaponInfo);
            };
            setWeaponWithBonus(eventInfo.newValue, setWeaponFunc, comparer);
        });
    });
}

const FOLLOWER_WEAPONS = [
    {repeating: '',       sections: ['',    '001', '002']},
    {repeating: 'hench',  sections: ['003', '004', '005']},
    {repeating: '',       sections: ['006', '007', '008']},
    {repeating: 'hench2', sections: ['009', '010', '011']},
    {repeating: '',       sections: ['012', '013', '014']},
    {repeating: 'hench3', sections: ['015', '016', '017']},
    {repeating: '',       sections: ['018', '019', '020']},
    {repeating: 'hench4', sections: ['021', '022', '023']},
    {repeating: '',       sections: ['024', '025', '026']},
    {repeating: 'hench5', sections: ['027', '028', '029']},
    {repeating: '',       sections: ['030', '031', '032']},
    {repeating: 'hench6', sections: ['033', '034', '035']},
];

FOLLOWER_WEAPONS.forEach(fw => {
    setupFollowerWeaponsAutoFill(fw.repeating, fw.sections);
});

// Monster weapons
on('change:repeating_monsterweapons:weaponname', function(eventInfo) {
    let rowId = parseSourceAttribute(eventInfo).rowId;
    let comparer = function (weapon1, weapon2, isPlayersOption) {
        let comparerFields = ['rof','small-medium','large','speed'];
        return comparerFields.every(f => weapon1[f] === weapon2[f]);
    }
    let setWeaponFunc = function (weapon) {
        if (weapon['bonusInt'] > 1) {
            weapon['small-medium'] += weapon['bonus'];
            weapon['large'] += weapon['bonus'];
            weapon['thac0'] = weapon['thac0'] - weapon['bonusInt'];
        }
        let weaponInfo = {
            [`repeating_monsterweapons_${rowId}_attacknum`] : weapon['rof'] || '1',
            [`repeating_monsterweapons_${rowId}_ThAC0`]     : weapon['thac0'],
            [`repeating_monsterweapons_${rowId}_damsm`]     : weapon['small-medium'],
            [`repeating_monsterweapons_${rowId}_daml`]      : weapon['large'],
            [`repeating_monsterweapons_${rowId}_weapspeed`] : weapon['speed'],
        };

        setAttrs(weaponInfo);
    };

    setWeaponWithBonus(eventInfo.newValue, setWeaponFunc, comparer,'monsterthac0');
});
//#endregion

on('clicked:grenade-miss', async function (eventInfo) {
    getAttrs(['character_name'], async function(values) {
        let characterName = values['character_name'];
        let rollBuilder = new RollTemplateBuilder('2Egrenademiss');
        let grenade = await extractQueryResult('?{What grenade have been thrown?|Acid|Holy water|Oil (lit)|Poison|Other}');
        switch (grenade) {
            case 'Acid':       rollBuilder.push('name=Acid','aoe=[[1]]','aoesplash=[[1+6]]',`hitdmg=[Damage](~${characterName}|acid-hit)`,`splashdmg=[Damage](~${characterName}|acid-splash)`); break;
            case 'Holy water': rollBuilder.push('name=Holy water','aoe=[[1]]','aoesplash=[[1+6]]',`hitdmg=[Damage](~${characterName}|holy-water-hit)`,`splashdmg=[Damage](~${characterName}|holy-water-splash)`); break;
            case 'Oil (lit)':  rollBuilder.push('name=Oil (lit)','aoe=[[3]]','aoesplash=[[3+6]]',`hitdmg=[Round 1](~${characterName}|oil-lit-hit1) [Round 2](~${characterName}|oil-lit-hit2)`,`splashdmg=[Damage](~${characterName}|oil-lit-splash)`); break;
            case 'Poison':     rollBuilder.push('name=Poison','aoe=[[1]]','aoesplash=[[1+6]]','hitdmg=Special','splashdmg=Special'); break;
            case 'Other': {
                let name   = await extractQueryResult('?{Grenade name}');
                let aoe    = await extractQueryResult('?{Area of effect (Diameter in feet)|1}');
                let damage = await extractQueryResult('?{Direct damage|1d6}');
                let splash = await extractQueryResult('?{Splash damage|1d3}');

                let customGrenade = {}
                customGrenade['custom-grenade-name'] = name;
                customGrenade['custom-grenade-hit'] = damage;
                customGrenade['custom-grenade-splash'] = splash;
                setAttrs(customGrenade);

                rollBuilder.push(`name=${name}`,`aoe=[[${aoe}]]`,`aoesplash=[[${aoe}+6]]`,`hitdmg=[Damage](~${characterName}|custom-grenade-hit)`,`splashdmg=[Damage](~${characterName}|custom-grenade-splash)`);
            }
        }
        let distanceName = await extractQueryResult('?{How far was it thrown?|Short|Medium|Long}');
        rollBuilder.push('direction=[[1d10]]', `distancename=${distanceName}`);
        switch (distanceName) {
            case 'Short': rollBuilder.push('distance=[[1d6cs1cf6]]'); break;
            case 'Medium': rollBuilder.push('distance=[[1d10cs1cf10]]'); break;
            case 'Long': rollBuilder.push('distance=[[2d10cs1cf10]]'); break;
        }
        rollBuilder.push('hit=[[0]]','splash=[[0]]');
        let finalRollText = rollBuilder.string();
        console.log(finalRollText);
        startRoll(finalRollText, function (roll) {
            console.log(roll);
            let computedRolls = {
                hit: 0,
                splash: 0
            };

            // See if monster is within direct hit
            if (roll.results.distance.result <= roll.results.aoe.result / 2) {
                computedRolls.hit = 1;
            } else if (roll.results.distance.result <= roll.results.aoesplash.result / 2) {
                computedRolls.splash = 1;
            }
            console.log(computedRolls);
            finishRoll(roll.rollId, computedRolls);
        });
    });
});

const INJURY_REGEX = /Graze|Singed|Chilled|Struck|Injured|Burn|Frostbit|Broken|Crushed|Shattered|Frozen|(?<!Armor|Shield|Helm|is) Destroyed|Severed|Dissolved|Incinerated|(Minor|Major|Severe)(?: internal)? Bleeding/gmi

on('clicked:repeating_weapons-damage:crit2', function(eventInfo) {
    console.log(eventInfo);
    let prefix = 'repeating_weapons-damage_';
    let fields = [
        'strbonus1','dexbonus1','weaponname1',
        'specialist-damage','mastery-damage','damadj',
        'damsm','daml','size','type'
    ].map(s => prefix+s);

    let nameFunc = (values) => values[prefix+'weaponname1'];
    let baseDamageFunc = (targetSize, values) => sizeToInt(targetSize) < 3
        ? values[prefix+'damsm']
        : values[prefix+'daml'];
    let damageAdjFunc = (values) => [
        `(${values[prefix+'damadj']})`,
        `({${values[prefix+'specialist-damage']},${values[prefix+'mastery-damage']}}kh1)`,
        `((@{strengthdmg})*${values[prefix+'strbonus1']})`,
        `((@{dexmissile})*${values[prefix+'dexbonus1']})`,
        '(@{temp-damadj})',
        '(@{misc-mod})'
    ].join('+');

    weaponPoCritTemplate(prefix, fields, nameFunc, baseDamageFunc, damageAdjFunc)
});

on('clicked:repeating_ammo:crit2', function (eventInfo) {
    console.log(eventInfo);
    let prefix = 'repeating_ammo_';
    let fields = [
        `strbonus3`,`dexbonus3`,`ammoname`,
        'specialist-damage2','mastery-damage2','damadj2',
        'damsm2','daml2','size','type'
    ].map(s => prefix+s);

    let nameFunc = (values) => values[prefix+'ammoname'];
    let baseDamageFunc = (targetSize, values) => sizeToInt(targetSize) < 3
        ? values[prefix+'damsm2']
        : values[prefix+'daml2'];
    let damageAdjFunc = (values) => [
        `(${values[prefix+'damadj2']})`,
        `((@{strengthdmg})*${values[prefix+'strbonus3']})`,
        `((@{dexmissile})*${values[prefix+'dexbonus3']})`,
        `({${values[prefix+'specialist-damage2']},${values[prefix+'mastery-damage2']}}kh1)`,
        '(@{temp-damadj})',
        '(@{misc-mod})'
    ].join('+');

    weaponPoCritTemplate(prefix, fields, nameFunc, baseDamageFunc, damageAdjFunc)
});

const SPELL_HITS_REGEX = /\((\dd\d\+?\d?|\d) hit/i;

async function debugSeverity(severityDice) {
    return false
        ? parseInt(await extractQueryResult('?{Debug severity|1}'))
        : await extractRollResult(severityDice);
}

function lookupEffect(severityRoll, spellTypeTable, generalLocation, targetType, set) {
    let effect;
    let additionalHit = {};
    if (severityRoll < 4) {
        effect = 'No unusual effect';
    } else if (severityRoll < 13) {
        effect = spellTypeTable[generalLocation][severityRoll];
    } else {
        effect = spellTypeTable[generalLocation][12];
        if (spellTypeTable[generalLocation][13]) {
            effect += spellTypeTable[generalLocation][13];
        } else {
            additionalHit = SPELL_CRIT_13_EFFECT_TABLE[targetType][generalLocation];
            effect += additionalHit.description;
        }
    }

    critEffectExplanations(effect, set);
    effect = `[[${severityRoll}]]: ${effect}`;
    return {
        effect: effect,
        additionalLocations: additionalHit.locations
    };
}

async function recursiveAdditionalHit(additionalLocations, iteration, additionalString, severityDice, boolObj, spellTypeTable, targetType, rollBuilder, set) {
    if (!additionalLocations)
        return;

    let additionalLocationRoll = await extractRollResult('1d100');
    let additionalLocation = additionalLocations.find(l => additionalLocationRoll <= l.chance);
    let displayAdditionalLocationRoll = additionalLocations.length === 1
        ? ''
        :`(1d100:${additionalLocationRoll})`;
    let severityRoll = await debugSeverity(severityDice);
    let generalLocation = additionalLocation.general;
    let specificLocation = additionalLocation.specific;
    let locationNote = '';
    if (targetType !== 'Humanoid' && generalLocation === 'Legs' && !boolObj.isSnakeLike) {
        boolObj.isSnakeLike = await extractQueryResult('?{Is the target snake-like or fish-like?|No|Yes}');
    }
    if (targetType !== 'Humanoid' && generalLocation === 'Legs' && boolObj.isSnakeLike === 'Yes') {
        generalLocation = 'Tail';
        specificLocation = 'Tail';
        locationNote = SPELL_CRIT_13_EFFECT_TABLE[targetType]['Tail'].note;
    }
    let effectObj = lookupEffect(severityRoll, spellTypeTable, generalLocation, targetType, set);
    let displayAdditionalEffect = `Location ${iteration}, ${additionalString} hit, hitting **${specificLocation}** ${locationNote} ${displayAdditionalLocationRoll}=${effectObj.effect}`;
    rollBuilder.push(displayAdditionalEffect);

    return await recursiveAdditionalHit(effectObj.additionalLocations, iteration, additionalString+' additional', severityDice, boolObj, spellTypeTable, targetType, rollBuilder, set);
}

function setupSpellCrit(section) {
    let prefix = `repeating_spells-${section}_`;
    let fields = [
        'spell-name','spell-damage-type','spell-crit-size'
    ];
    on(`clicked:repeating_spells-${section}:spell-crit2`, function (eventInfo) {
        console.log(eventInfo);
        let attrFields = fields.map(s => prefix+s);
        getAttrs(attrFields, async function (values) {
            let rollBuilder = new RollTemplateBuilder('2Epocrit');
            rollBuilder.push('character=@{character_name}',`name=${values[prefix+'spell-name']}`);

            let errors = [];

            let lookupType;
            let displayType = values[prefix+'spell-damage-type'];
            switch (displayType.toLowerCase().trim()) {
                case 'acid':
                    lookupType = 'Acid';
                    break;
                case 'cold':
                    lookupType = 'Cold';
                    break;
                case 'construction':
                    lookupType = 'Constriction';
                    break;
                case 'crushing':
                    lookupType = 'Crushing';
                    break;
                case 'electricity':
                case 'lightning':
                    lookupType = 'Electricity';
                    break;
                case 'fire':
                    lookupType = 'Fire';
                    break;
                case 'impact':
                    lookupType = 'Impact';
                    break;
                case 'slashing':
                    lookupType = 'Slashing';
                    break;
                case 'vibration':
                    lookupType = 'Vibration';
                    break;
                case 'wounding':
                    lookupType = 'Wounding';
                    break;
                default:
                    lookupType = displayType = await extractQueryResult('?{What damage type does the magic inflict?' +
                        '|Acid' +
                        '|Cold' +
                        '|Crushing' +
                        '|Electricity/Lightning,Electricity' +
                        '|Fire' +
                        '|Impact' +
                        '|Slashing' +
                        '|Vibration' +
                        '|Wounding' +
                        '|Not viable}');
                    break;
            }

            let spellTypeTable = SPELL_CRIT_EFFECT_TABLE[lookupType];
            if (!spellTypeTable)
                errors.push('damage type');
            rollBuilder.push(`type=${displayType.trim()}`);

            let targetType = await extractQueryResult('?{What are you attacking?|Humanoid|Animal|Monster}');
            let targetSize = await extractQueryResult('?{Target size?|Medium|Tiny|Small|Medium|Large|Huge|Gargantuan}');
            rollBuilder.push(`target=${targetType}`);
            rollBuilder.push(`targetsize=${targetSize}`);

            let size = values[prefix+'spell-crit-size'];

            let spellSizeCategory;
            switch (size.split(' (')[0]) {
                case 'Medium':
                case 'Moderate':
                    spellSizeCategory = 2;
                    break;
                case 'Large':
                    spellSizeCategory = 3;
                    break;
                case 'Huge':
                    spellSizeCategory = 4;
                    break;
                case 'Gargantuan':
                    spellSizeCategory = 5;
                    break;
                case '':
                case 'None':
                    spellSizeCategory = 0;
                    size = 'None';
                    errors.push('size');
                    break;
                default:
                    let sizeString = await extractQueryResult('?{What size is the spell?' +
                        '|1 Target or 5´ sq. or 2´ rad = Medium (1 hit),2' +
                        '|2-9 Targets or 30´ sq. or 15´ rad = Large (1d3 hits),3' +
                        '|10+ Targets or 40´ sq. or 20´ rad = Huge (1d4 hits),4' +
                        '|40+ Targets or 100´ sq. or 40´ rad = Gargantuan (1d6+1 hits),5}');
                    spellSizeCategory = parseInt(sizeString);
            }
            rollBuilder.push(`size=${size}`);

            let hits = 0;
            let hitDice = '';
            let rollMatch = size.match(SPELL_HITS_REGEX); // roll
            let rangeMatch = size.match(/\((\d)-(\d) hit/i); // range
            let rollMatch2;
            if (SPELL_SIZE_MAP[spellSizeCategory])
                rollMatch2 = SPELL_SIZE_MAP[spellSizeCategory].match(SPELL_HITS_REGEX);

            async function sizeReduction(rollMatch) {
                if (targetSize === 'Huge') {
                    rollMatch = SPELL_SIZE_MAP[Math.max(spellSizeCategory - 1, 2)].match(SPELL_HITS_REGEX);
                    hitDice = `(${rollMatch[1]}) `;
                }
                if (targetSize === 'Gargantuan') {
                    rollMatch = SPELL_SIZE_MAP[Math.max(spellSizeCategory - 2, 2)].match(SPELL_HITS_REGEX);
                    hitDice = `(${rollMatch[1]}) `;
                }
                return await extractRollResult(rollMatch[1]);
            }

            if (rollMatch) {
                hits = await sizeReduction(rollMatch);
            } else if (rangeMatch) {
                let lower = parseInt(rangeMatch[1]);
                let higher = parseInt(rangeMatch[2]);
                let hitQuery = '';
                for (let i = lower; i <= higher; i++) {
                    hitQuery += `|${i}`
                }
                let hitsString = await extractQueryResult(`?{How many hits?${hitQuery}}`);
                hits = parseInt(hitsString);
            } else if (rollMatch2) {
                hits = await sizeReduction(rollMatch2)
            } else if (!size || size === 'None') {
                hits = 0;
            } else {
                let hitsString = await extractQueryResult(`?{How many hits?|1}`);
                hits = await extractRollResult(hitsString);
            }

            let attackType = await extractQueryResult(`?{How are you attacking?|Regular Attack|Low Attack|High Attack${spellSizeCategory === 2 ? '|Called Shot' : ''}}`);
            rollBuilder.push(`attack=${attackType}`);

            let locationDice;
            let locationRolls = [];
            let set = new Set();
            if (attackType === 'Called Shot' && hits === 1) {
                let locationList = [];
                for (const [key, value] of Object.entries(LOCATION_TABLE[targetType])) {
                    let specificLocation = value.specific;
                    if (!set.has(specificLocation)) {
                        set.add(specificLocation)
                        locationList.push(`${specificLocation},${key}`)
                    }
                }
                set.clear();
                locationRolls.push(await extractQueryResult(`?{Where are you hitting?|${locationList.join('|')}}`));
            } else {
                switch (attackType) {
                    case 'Regular Attack': locationDice = '1d10'; break;
                    case 'Low Attack': locationDice = '1d6'; break;
                    case 'High Attack': locationDice = '1d6+4'; break;
                }
                for (let i = 0; i < hits; i++) {
                    locationRolls.push(await extractRollResult(locationDice));
                }
            }

            let severityDice = await extractQueryResult('?{How severe is the effect?' +
                '|Minor 1d6 (Max. potential damage is less than ½ target max hp),1d6' +
                '|Major 2d4 (Max. potential damage is less than target max hp),2d4' +
                '|Severe 2d6 (Max. potential damage is less than twice target max hp),2d6' +
                '|Mortal 2d8 (Max. potential damage is twice or more target max hp),2d8}');
            switch (severityDice) { // optional to add this
                case '1d6': rollBuilder.push(`severity=Minor`); break;
                case '2d4': rollBuilder.push(`severity=Major`); break;
                case '2d6': rollBuilder.push(`severity=Severe`); break;
                case '2d8': rollBuilder.push(`severity=Mortal`); break;
            }

            if (hits > 0 && errors.length === 0)
                rollBuilder.push(`hits=Hitting ${hitDice}[[${hits}]] location${hits > 1 ? 's':''} and rolling ${severityDice} for effect`);
            else
                rollBuilder.push(`hits=Cannot show effects due to missing fields: ${errors.join(', ')}`);

            let boolObj = {};
            if (spellTypeTable) {
                for (let i = 0; i < locationRolls.length; i++) {
                    let locationRoll = locationRolls[i];
                    let locationObject = LOCATION_TABLE[targetType][locationRoll];
                    let locationNote = '';
                    if (targetType !== 'Humanoid' && locationObject.general === 'Legs' && !boolObj.isSnakeLike) {
                        boolObj.isSnakeLike = await extractQueryResult('?{Is the target snake-like or fish-like?|No|Yes}');
                    }
                    if (targetType !== 'Humanoid' && locationObject.general === 'Legs' && boolObj.isSnakeLike === 'Yes') {
                        locationObject = LOCATION_TABLE[targetType][5];
                        locationNote = locationObject.note;
                    }

                    let severityRoll = await debugSeverity(severityDice);
                    let displayLocationRoll = attackType === 'Called Shot'
                        ? ''
                        : `(${locationDice}:${locationRoll})`;
                    let {effect, additionalLocations} = lookupEffect(severityRoll, spellTypeTable, locationObject.general, targetType, set);
                    let displayEffect = `Location ${i+1} hitting the **${locationObject.specific}** ${locationNote} ${displayLocationRoll}=${effect}`;
                    rollBuilder.push(displayEffect);

                    await recursiveAdditionalHit(additionalLocations, i+1, 'additional', severityDice, boolObj, spellTypeTable, targetType, rollBuilder, set);
                }
            }

            rollBuilder.push(Array.from(set));
            let finalRollText = rollBuilder.string();
            if (section.includes('monster'))
                finalRollText = `@{wtype} ${finalRollText}`;

            console.log(finalRollText);

            startRoll(finalRollText, function (roll) {
                console.log(roll);
                let computedRolls = {};
                finishRoll(roll.rollId, computedRolls);
            });
        });
    });
}

function critEffectExplanations(critEffect, set) {
    let injuryMatch = critEffect.match(INJURY_REGEX);
    if (!injuryMatch)
        return;

    injuryMatch = injuryMatch.map(s => s.toLowerCase().replace('internal ', '').trim())
        .filter((v, i, a) => a.indexOf(v) === i);
    injuryMatch.forEach(key => {
        switch (key) {
            case 'graze':
            case 'singed':
            case 'chilled':
                set.add('grazed=1');
                break;
            case 'struck':
                set.add('struck=1');
                break;
            case 'injured':
            case 'burn':
            case 'frostbit':
                set.add('injured=1');
                break;
            case 'broken':
                set.add('broken=1');
                break;
            case 'crushed':
            case 'shattered':
            case 'destroyed':
                set.add('crushed=1');
                break;
            case 'frozen':
                set.add('crushed=1');
                set.add('frozen=1');
                break;
            case 'severed':
            case 'dissolved':
            case 'incinerated':
                set.add('severed=1');
                break;
            case 'minor bleeding':
                set.add('minorbleeding=1');
                set.add('bleedingnote=1');
                break;
            case 'major bleeding':
                set.add('majorbleeding=1');
                set.add('bleedingnote=1');
                break;
            case 'severe bleeding':
                set.add('severebleeding=1');
                set.add('bleedingnote=1');
                break;
        }
    });
}

function weaponPoCritTemplate(prefix, fields, nameFunc, baseDamageFunc, damageAdjFunc) {
    getAttrs(fields, async function (values) {
        let rollBuilder = new RollTemplateBuilder('2Epocrit');
        rollBuilder.push('character=@{character_name}');

        let errors = [];

        let weaponName = nameFunc(values);
        let weaponSize = displaySize(values[prefix+'size']);
        if (weaponName.match(/heavy (crossbow|quarrel|bolt)/i)) {
            weaponSize = 'Large';
        } else if (weaponName.match(/arrow|quarrel|bolt/i)) {
            weaponSize = 'Medium';
        }
        let weaponType = values[prefix+'type'];
        if (weaponType.includes('/')) {
            let displayTypes = weaponType.split('/')
                .map(s => displayWeaponType(s))
                .join('|');

            weaponType = await extractQueryResult(`?{How are your attack with your weapon?|${displayTypes}}`);
        } else {
            weaponType = displayWeaponType(weaponType);
        }
        rollBuilder.push(`name=${weaponName}`);
        rollBuilder.push(`size=${weaponSize}`);
        rollBuilder.push(`type=${weaponType}`);

        let targetType = await extractQueryResult('?{What are you attacking?|Humanoid|Animal|Monster}');
        let targetSize = await extractQueryResult('?{Target size?|Medium|Tiny|Small|Medium|Large|Huge|Gargantuan}');
        rollBuilder.push(`target=${targetType}`);
        rollBuilder.push(`targetsize=${targetSize}`);

        let attackType = await extractQueryResult('?{How are you attacking?|Regular Attack|Low Attack|High Attack|Called Shot}');
        rollBuilder.push(`attack=${attackType}`);

        let locationDice = '';
        let locationRoll;
        let set = new Set();
        if (attackType === 'Called Shot') {
            let locationList = [];
            for (const [key, value] of Object.entries(LOCATION_TABLE[targetType])) {
                let specificLocation = value.specific;
                if (!set.has(specificLocation)) {
                    set.add(specificLocation)
                    locationList.push(`${specificLocation},${key}`)
                }
            }
            set.clear();
            locationRoll = await extractQueryResult(`?{Where are you hitting?|${locationList.join('|')}}`);
        } else {
            switch (attackType) {
                case 'Regular Attack': locationDice = '1d10'; break;
                case 'Low Attack': locationDice = '1d6'; break;
                case 'High Attack': locationDice = '1d6+4'; break;
            }
            locationRoll = await extractRollResult(locationDice);
        }

        let locationObject = LOCATION_TABLE[targetType][locationRoll];
        let locationNote = '';
        if (locationRoll < 5 && targetType !== 'Humanoid') {
            let isSnakeLike = await extractQueryResult('?{Is the target snakelike or fishlike?|No|Yes}');
            if (isSnakeLike === "Yes") {
                locationObject = LOCATION_TABLE[targetType][5];
                locationNote = locationObject.note;
            }
        }

        let severityDice;
        const sizeDiff = sizeToInt(weaponSize) - sizeToInt(targetSize);
        if (sizeDiff < 0) {
            rollBuilder.push(`severity=Minor`);
            severityDice = '1d6';
        } else if (sizeDiff === 0) {
            rollBuilder.push(`severity=Major`);
            severityDice = '2d4';
        } else if (sizeDiff === 1) {
            rollBuilder.push(`severity=Severe`);
            severityDice = '2d6';
        } else if (sizeDiff > 1) {
            rollBuilder.push(`severity=Mortal`);
            severityDice = '2d8';
        }
        let severityRoll = await extractRollResult(severityDice);

        let critEffect = '';
        let weaponTypeTable = WEAPON_CRIT_EFFECT_TABLE[weaponType];
        if (weaponTypeTable) {
            if (severityRoll < 4) {
                critEffect = 'No unusual effect'
            } else if (locationObject) {
                let severityLookup = severityRoll > 12 ? 12 : severityRoll;
                critEffect = weaponTypeTable[targetType][locationObject.general][severityLookup];
            } else {
                critEffect = 'No unusual effect';
            }

            let displayLocationRoll = attackType === 'Called Shot'
                ? ''
                : `(${locationDice}:${locationRoll})`;
            rollBuilder.push(`Hitting the **${locationObject.specific}** ${locationNote} ${displayLocationRoll} and rolling ${severityDice} for effect=[[${severityRoll}]]: ${critEffect}`);
            critEffectExplanations(critEffect, set);
        } else {
            errors.push('weapon type');
        }

        let weaponDamage = baseDamageFunc(targetSize, values);
        if (weaponDamage.match(/\d/)) {
            let damage;
            if (severityRoll > 12) {
                rollBuilder.push(`multiplier=(Triple)`);
                damage = `(${weaponDamage})*3`;
            } else if (critEffect.includes('triple') && await extractQueryResult('?{Is the target wearing armor?|Yes|No}') === 'No') {
                rollBuilder.push(`multiplier=(Triple)`);
                damage = `(${weaponDamage})*3`;
            } else {
                rollBuilder.push(`multiplier=(Double)`);
                damage = `(${weaponDamage})*2`;
            }
            rollBuilder.push(`damage=[[${damage}+[[${damageAdjFunc(values)}]] ]]`);
        }

        if (errors.length > 0)
            rollBuilder.push(`hits=Cannot show effects due to missing fields: ${errors.join(', ')}`);

        rollBuilder.push(Array.from(set));
        let finalRollText = rollBuilder.string();

        console.log(finalRollText);

        startRoll(finalRollText, function (roll) {
            console.log(roll);
            let computedRolls = {};
            finishRoll(roll.rollId, computedRolls);
        });
    });
}
//#endregion

//#region Proficiencies
//Weapon proficiency slots
on('change:repeating_weaponprofs:weapprofnum remove:repeating_weaponprofs change:weapprof-slots-total-calc', function(eventInfo) {
    if (doEarlyReturn(eventInfo, ['weapprofnum']))
        return;
    repeatingCalculateRemaining('weaponprofs', ['weapprofnum'], 'weapprof-slots-total-calc', 'weapprof-slots-remain');
});
//Weapon proficiency autofill
on('change:repeating_weaponprofs:weapprofname', function(eventInfo) {
    let weaponProficiency = weaponProficiencies[eventInfo.newValue];
    if (!weaponProficiency)
        return;

    getAttrs(BOOK_FIELDS, function (books) {
        if (bookInactiveShowToast(books, weaponProficiency))
            return;

        setAttrs({
            'repeating_weaponprofs_weapprofnum'  : weaponProficiency['slots'],
        });
    });
});

//Nonweapon proficiency slots
const NONWEAPON_PROFICIENCY_SECTIONS = [
    {section:'profs',    nameField:'profname',    slotsField:'profslots',    abilityScoreField:'profstatnum',    modifierField:'profmod', totalField:'prof-slots-total-calc' },
    {section:'psiprofs', nameField:'psiprofname', slotsField:'psiprofslots', abilityScoreField:'psiprofstatnum', modifierField:'psiprofmod'},
];
NONWEAPON_PROFICIENCY_SECTIONS.forEach(({section, nameField, slotsField, abilityScoreField, modifierField, totalField}) => {
    let changeTotal = totalField ? `change:${totalField}` : '';
    on(`change:repeating_${section}:${slotsField} remove:repeating_${section} ${changeTotal}`, function(eventInfo){
        if (doEarlyReturn(eventInfo, [slotsField])) {
            return;
        }

        let sectionsCopy = [...NONWEAPON_PROFICIENCY_SECTIONS];
        getAttrs(['prof-slots-total-calc'], function (values) {
            let accumulator = values['prof-slots-total-calc'];
            repeatingCalculateRemainingRecursive(sectionsCopy, accumulator, 'prof-slots-remain');
        });
    });
    //Nonweapon proficiency autofill
    on(`change:repeating_${section}:${nameField}`, function (eventInfo) {
        let nonweaponProficiencies = NONWEAPON_PROFICIENCIES_TABLE[eventInfo.newValue];
        if (!nonweaponProficiencies)
            return;

        let comparer = function (nonweaponProf1, nonweaponProf2, isPlayersOption) {
            return ['slots','abilityScore','modifier'].every(f => nonweaponProf1[f] === nonweaponProf2[f])
        }

        getAttrs(BOOK_FIELDS, async function (books) {
            let nonweaponProficiency = await selectVersion(nonweaponProficiencies, books, comparer, 'nonweapon proficiency');
            console.log(nonweaponProficiency);
            if (!nonweaponProficiency)
                return;

            let rowId = parseSourceAttribute(eventInfo).rowId;

            let nonweaponProfInfo = {};
            nonweaponProfInfo[`repeating_${section}_${rowId}_${slotsField}`]        = nonweaponProficiency['slots'];
            nonweaponProfInfo[`repeating_${section}_${rowId}_${abilityScoreField}`] = nonweaponProficiency['abilityScore'];
            nonweaponProfInfo[`repeating_${section}_${rowId}_${modifierField}`]     = nonweaponProficiency['modifier'];
            setAttrs(nonweaponProfInfo);
        });
    });
});
//#endregion

//#region Special Talents
on('change:repeating_talents:talentname', function (eventInfo) {
    let talent = TALENTS[eventInfo.newValue];
    if (!talent)
        return;
    let abilityField = talent['abilityScore'].replace(/[@{}]|N\/A/g, '').toLowerCase();
    let subAbilityField = talent['subAbilityScore'].replace(/[@{}]/g, '').toLowerCase();
    let fields = [abilityField, subAbilityField, ...BOOK_FIELDS].filter(Boolean);
    getAttrs(fields, function (values) {
        if (bookInactiveShowToast(values, talent))
            return;
        let abilityScore;
        let abilityScoreString;
        if (values[subAbilityField]) {
            abilityScore = parseInt(values[subAbilityField]) || 0;
            abilityScoreString = talent['subAbilityScore'];
        } else {
            abilityScore = parseInt(values[abilityField]) || 0;
            abilityScoreString = talent['abilityScore'];
        }

        let newValue = {};
        newValue['repeating_talents_talentslots'] = talent['slots'];
        newValue['repeating_talents_talentpoints'] = talent['points'];
        newValue['repeating_talents_talentstatnum'] = abilityScoreString;
        newValue['repeating_talents_talentmod'] = talent['modifier'];
        newValue['repeating_talents_talentrating'] = talent['rating'] || '';
        newValue['repeating_talents_talentratingmod'] = ABILITY_MODIFIERS[abilityScore] || 0;
        setAttrs(newValue);
    });
});

on('change:repeating_talents:talentslots change:repeating_talents:talentpoints remove:repeating_talents', function (eventInfo) {
    if (doEarlyReturn(eventInfo, ['talentslots']) && doEarlyReturn(eventInfo, ['talentpoints']))
        return;
    if (isSheetWorkerUpdate(eventInfo) && eventInfo.triggerName.includes('talentpoints'))
        return;

    TAS.repeating('talents')
        .attrs('talent-slots-spent','talent-spent')
        .fields('talentslots','talentpoints')
        .reduce(function(m,r){
            m.slots+=(r.I['talentslots']);
            m.points+=(r.I['talentpoints']);
            return m;

        },{slots:0,points:0},function(m,r,a){
            a.I['talent-slots-spent']=m.slots;
            a.I['talent-spent']=m.points;
        })
        .execute();
});

on('change:repeating_talents:talentstatnum', async function (eventInfo) {
    if (isSheetWorkerUpdate(eventInfo))
        return;

    let parse = parseSourceAttribute(eventInfo);
    getAttrs(['repeating_talents_talentstatnum'], async function (values) {
        let abilityScore = values['repeating_talents_talentstatnum'];
        if (!abilityScore.startsWith('@') && isNaN(parseInt(abilityScore)))
            return;

        let abilityScoreValue = await extractRollResult(abilityScore);

        let newValue = {};
        newValue[`repeating_talents_${parse.rowId}_talentratingmod`] = ABILITY_MODIFIERS[abilityScoreValue] || 0;
        setAttrs(newValue);
    });
});
//#endregion

//#region Traits
on('change:repeating_traits:traitname', function (eventInfo) {
    let trait = TRAITS[eventInfo.newValue];
    if (!trait)
        return;
    let subAbilityField = trait['subAbilityScore'].replace(/[@{}]|N\/A/g, '').toLowerCase();
    let fields = [subAbilityField, ...BOOK_FIELDS].filter(Boolean);
    getAttrs(fields, function (values) {
        if (bookInactiveShowToast(values, trait))
            return;
        let abilityScoreString = values[subAbilityField]
            ? trait['subAbilityScore']
            : trait['abilityScore'];

        let newValue = {};
        newValue['repeating_traits_traitpoints'] = trait['points'];
        newValue['repeating_traits_traitstatnum'] = abilityScoreString;
        setAttrs(newValue);
    });
});

on('change:repeating_traits:traitpoints remove:repeating_traits', function (eventInfo) {
    if (doEarlyReturn(eventInfo, ['traitpoints']))
        return;
    TAS.repeatingSimpleSum('traits', 'traitpoints', 'trait-spent');
});
//#endregion

//#region Disadvantages
on('change:repeating_disads:disadname', function (eventInfo) {
    let disadvantage = DISADVANTAGES[eventInfo.newValue];
    if (!disadvantage)
        return;
    let subAbilityField = disadvantage['subAbilityScore'].replace(/(ceil)?[\(\)@{}/2]/g, '').toLowerCase();
    let fields = [subAbilityField, ...BOOK_FIELDS].filter(Boolean);
    getAttrs(fields, async function (values) {
        if (bookInactiveShowToast(values, disadvantage))
            return;
        let abilityScoreString = values[subAbilityField]
            ? disadvantage['subAbilityScore']
            : disadvantage['abilityScore'];

        let newValue = {};
        newValue[`repeating_disads_disadpoints`] = disadvantage['points'];
        newValue[`repeating_disads_disadstatnum`] = abilityScoreString;
        setAttrs(newValue);
    });
});
on('change:repeating_disads:disadpoints remove:repeating_disads', function (eventInfo) {
    if (doEarlyReturn(eventInfo, ['disadpoints']))
        return;
    TAS.repeatingSimpleSum('disads', 'disadpoints', 'disadvantage-gained');
});
//#endregion

//#region Equipment
//Equipment Carried Section
on('change:repeating_gear:gearweight change:repeating_gear:gearqty remove:repeating_gear', function(eventInfo){
    if (doEarlyReturn(eventInfo, ['gearweight', 'gearqty']))
        return;
    repeatingMultiplySum('gear', 'gearweight', 'gearqty', 'gearweighttotal', 2);
});

//Equipment Stored Section
on('change:repeating_gear-stored:gear-stored-weight change:repeating_gear-stored:gear-stored-qty change:repeating_gear-stored:on-mount remove:repeating_gear-stored', function(eventInfo){
    if (doEarlyReturn(eventInfo, ['gear-stored-weight', 'gear-stored-qty']))
        return;

    TAS.repeating('gear-stored')
        .attrs('mount-gear-weight-total','stored-gear-weight-total')
        .fields('on-mount','gear-stored-weight','gear-stored-qty')
        .reduce(function(m,r){
            m.allgearweight+=(r.F['gear-stored-weight'] * r.I['gear-stored-qty']);
            m.mountgearweight+=(r.F['gear-stored-weight'] * r.I['gear-stored-qty'] * r.I['on-mount']);
            return m;

        },{allgearweight:0,mountgearweight:0},function(m,r,a){
            a.D[2]['mount-gear-weight-total']=m.mountgearweight;
            a.D[2]['stored-gear-weight-total']=(m.allgearweight-m.mountgearweight);
        })
        .execute();
})

on('change:repeating_scrolls:scroll', async function (eventInfo) {
    if (!eventInfo.newValue)
        return;

    let spellName = eventInfo.newValue.replace('Scroll of ', '');
    let wizardSpell = wizardSpells['wizmonster'][spellName];
    let priestSpell = priestSpells['primonster'][spellName];
    if (!wizardSpell && !priestSpell)
        return

    let spell;
    let spellClass;
    if (wizardSpell && priestSpell) {
        spellClass = await extractQueryResult(`?{Is ${eventInfo.newValue} a Wizard or Priest scroll?|Wizard|Priest}`);
        spell = spellClass === 'Wizard' ? wizardSpell : priestSpell;
    } else if (wizardSpell) {
        spell = wizardSpell;
        spellClass = 'Wizard';
    } else {
        spell = priestSpell;
        spellClass = 'Priest';
    }

    getAttrs([...BOOK_FIELDS, ...SCHOOL_FIELDS, ...SPHERE_FIELDS], async function(books) {
        if (bookInactiveShowToast(books, spell))
            return

        let parse = parseSourceAttribute(eventInfo);

        let rollBuilder = new RollTemplateBuilder('2Espell');
        rollBuilder.push(`title=@{scroll}\n(Casting level @{scroll-level})`);
        rollBuilder.push(`splevel=${displaySpellLevel(spell.level, spellClass)}`);
        rollBuilder.push(`school=${getSpellSchools(spell, books)}`);
        if (spellClass === 'Priest') {
            let sphereRules = getActiveSettings(SPHERE_FIELDS, books);
            rollBuilder.push(`sphere=${getSpellSpheres(spell, sphereRules)}`);
        }
        rollBuilder.push(`range=${spell['range']}`);
        rollBuilder.push(`components=V`);
        rollBuilder.push(`duration=${spell['duration']}`);
        rollBuilder.push(`time=@{scroll-speed}`);
        rollBuilder.push('scroll=true');
        rollBuilder.push(`aoe=${spell['aoe']}`);
        rollBuilder.push(`save=${spell['saving-throw']}`);
        rollBuilder.push(`subtlety=${spell['subtlety'] || ''}`);
        rollBuilder.push(`sensory=${spell['sensory'] || ''}`);
        rollBuilder.push(`knockdown=${spell['knockdown'] || ''}`);
        rollBuilder.push(`crit=${spell['crit-size'] || ''}`);
        rollBuilder.push(`damage=${spell['damage']}`);
        rollBuilder.push(`damagetype=${spell['damage-type']}`);
        rollBuilder.push(`reference=${spell['reference']}, ${spell['book']}`);
        rollBuilder.push(`materials=${spell['materials'] ? 'Included in the scroll.' : ''}`);
        rollBuilder.push('checkroll=[[1d100]]%');
        rollBuilder.push('checktarget=[[@{scroll-failure}]]%');
        rollBuilder.push('fail=DM roll for Magical Spell Failure');
        rollBuilder.push(`effects=${spell['effect']}`);

        let scrollMacro = rollBuilder.string();
        scrollMacro = scrollMacro.replaceAll('[[@{level-wizard}]]','[[@{scroll-level}]]')
            .replaceAll('[[@{level-priest}]]', '[[@{scroll-level}]]');

        let recommendedMinimumLevel;

        let spellLevel = parseInt(spell.level);
        if (isNaN(spellLevel)) {
            recommendedMinimumLevel = 6;
        } else if (spellLevel <= 3) {
            recommendedMinimumLevel = 6;
        } else if (spellLevel === 4 || spellLevel === 5) {
            recommendedMinimumLevel = spellLevel*2;
        } else if (spellLevel === 6 && spellClass === 'Priest') {
            recommendedMinimumLevel = spellLevel*2;
        } else if (spellLevel >= 6) {
            recommendedMinimumLevel = spellLevel*2+1
        }

        let scribeLevel = await extractQueryResult(`?{At what level is ${eventInfo.newValue} scribed? (Recommended minimum is ${recommendedMinimumLevel}th level)|${recommendedMinimumLevel}}`);

        let spellFailure = await extractQueryResult(`?{What is the risk of spell failure for ${eventInfo.newValue}? (If you do not use this rule, set the value to 0)|0}`);

        let scrollInfo = {
            [`repeating_scrolls_${parse.rowId}_scroll-speed`]: spell['cast-time'],
            [`repeating_scrolls_${parse.rowId}_scroll-level`]: scribeLevel,
            [`repeating_scrolls_${parse.rowId}_scroll-failure`]: spellFailure,
            [`repeating_scrolls_${parse.rowId}_scroll-macro`]: scrollMacro,
        }

        setAttrs(scrollInfo);
    });
});
//#endregion

on(`change:repeating_gem:gemvalue change:repeating_gem:gemqty remove:repeating_gem`, function(eventInfo) {
    if (doEarlyReturn(eventInfo, ['gemvalue', 'gemqty']))
        return;
    repeatingMultiplySum('gem', 'gemvalue', 'gemqty', 'gemstotalvalue');
})

//#region Psionic
// Psionic tabs, control hidden or visible options
const PSIONIC_SKILLS_AND_POWERS_FIELD = 'tab8';
on(`change:${PSIONIC_SKILLS_AND_POWERS_FIELD} sheet:opened`, function (eventInfo) {
    getAttrs([PSIONIC_SKILLS_AND_POWERS_FIELD], function (values) {
        let elements = $20('.sheet-section-psionics option.sheet-hidden');
        if (values[PSIONIC_SKILLS_AND_POWERS_FIELD] === "1") {
            elements.addClass('sheet-show');
        } else {
            elements.removeClass('sheet-show');
        }
    })
});

setupStaticCalculateTotal('constitution-psi', ['constitution','psion-con-mod']);
setupStaticCalculateTotal('intelligence-psi', ['intelligence','psion-int-mod']);
setupStaticCalculateTotal('wisdom-psi', ['wisdom','psion-wis-mod']);

const PSIONIC_CORE_SECTIONS = [
    { discipline: 'Telepathic',      section: 'psion-telepathy',            name: 'psiontelepathic',    macro: 'psiontelepathic-macro',         number: '',   cost_number: '20' },
    { discipline: 'Telepathic',      section: 'psion-telepathic-science',   name: 'telepathic-science', macro: 'psiontelepathic-science-macro', number: '1',  cost_number: '21' },
    { discipline: 'Psychokinetic',   section: 'psion-psychokinesis',        name: 'psionkinetic',       macro: 'psionkinetic-macro',            number: '2',  cost_number: '22' },
    { discipline: 'Psychokinetic',   section: 'psion-kinetic-science',      name: 'kinetic-science',    macro: 'psionkinetic-science-macro',    number: '3',  cost_number: '23' },
    { discipline: 'Psychoportive',   section: 'psion-portation',            name: 'psionportation',     macro: 'psionportation-macro',          number: '4',  cost_number: '24' },
    { discipline: 'Psychoportive',   section: 'psion-portation-science',    name: 'portation-science',  macro: 'psionportation-science-macro',  number: '5',  cost_number: '25' },
    { discipline: 'Psychometabolic', section: 'psion-metabolic',            name: 'psionmetabolic',     macro: 'psionmetabolic-macro',          number: '6',  cost_number: '26' },
    { discipline: 'Psychometabolic', section: 'psion-metabolic-science',    name: 'metabolic-science',  macro: 'psionmetabolic-science-macro',  number: '7',  cost_number: '27' },
    { discipline: 'Clairsentient',   section: 'psion-clairvoyance',         name: 'psionclair',         macro: 'psionclair-macro',              number: '8',  cost_number: '28' },
    { discipline: 'Clairsentient',   section: 'psion-clairvoyance-science', name: 'clair-science',      macro: 'psionclair-science-macro',      number: '9',  cost_number: '29' },
    { discipline: 'Metapsionic',     section: 'psion-metapsionics',         name: 'psionmeta',          macro: 'psionmeta-macro',               number: '12', cost_number: '32' },
    { discipline: 'Metapsionic',     section: 'psion-metapsionic-science',  name: 'meta-science',       macro: 'psionmeta-science-macro',       number: '13', cost_number: '33' },
    { discipline: 'Attack',          section: 'psion-attack5',              name: 'psionattacking',     macro: 'psionattacking-macro',          number: '10', cost_number: '30' },
    { discipline: 'Defense',         section: 'psion-defense5',             name: 'psiondefending',     macro: 'psiondefending-macro',          number: '11', cost_number: '31' },
];

on('sheet:opened change:character_name', function (eventInfo) {
    PSIONIC_CORE_SECTIONS.forEach(({section}) => {
        TAS.repeating(section)
            .attr('character_name')
            .field('action-check', 'action-macro')
            .each(function (row, attrSet, id, rowSet) {
                row['action-check'] = `%{${attrSet.character_name}|repeating_${section}_${id}_action-check}`;
                row['action-macro'] = `%{${attrSet.character_name}|repeating_${section}_${id}_action-macro}`;
            })
            .execute();
    });
});
PSIONIC_CORE_SECTIONS.forEach(({section, name, macro, number, cost_number, discipline}) => {
    on(`change:repeating_${section}:${macro}`, function (eventInfo) {
        let parse = parseSourceAttribute(eventInfo);
        getAttrs(['character_name'], function (values) {
            let powerInfo = {};
            powerInfo[`repeating_${section}_action-check`] = `%{${values.character_name}|repeating_${section}_${parse.rowId}_action-check}`;
            powerInfo[`repeating_${section}_action-macro`] = `%{${values.character_name}|repeating_${section}_${parse.rowId}_action-macro}`;
            return setAttrs(powerInfo,{silent:true});
        });
    });

    on(`change:repeating_${section}:${name}`, function (eventInfo) {
        let parse = parseSourceAttribute(eventInfo);
        getAttrs(['character_name', ...BOOK_FIELDS], function (values) {
            let powerInfo = {};
            powerInfo[`repeating_${section}_action-check`] = `%{${values.character_name}|repeating_${section}_${parse.rowId}_action-check}`;
            powerInfo[`repeating_${section}_action-macro`] = `%{${values.character_name}|repeating_${section}_${parse.rowId}_action-macro}`;
            if (!eventInfo.newValue)
                return setAttrs(powerInfo,{silent:true});

            let displayDiscipline = discipline;
            let tier = name.includes('science') ? 'Science' : 'Devotion';
            let powerTable = PSIONIC_POWERS[discipline];
            let power = powerTable[tier][eventInfo.newValue];
            if (discipline === 'Attack' || discipline === 'Defense') {
                displayDiscipline = 'Telepathic';
                tier = power ? tier : 'Science';
                power = power || powerTable[tier][eventInfo.newValue];
            }
            if (!power)
                return setAttrs(powerInfo,{silent:true});

            let toastObject = bookInactiveGetToastObject(values, power);
            if (toastObject)
                return setAttrs(Object.assign(powerInfo, toastObject),{silent:true});

            powerInfo[`repeating_${section}_powerscore-nomod${number}`] = power['attribute'];
            powerInfo[`repeating_${section}_powerscore-mod${number}`]   = power['modifier'];
            powerInfo[`repeating_${section}_PSP-cost${cost_number}`]    = power['initial-cost'];
            powerInfo[`repeating_${section}_PSP-cost-maintenance`]      = power['maintenance-cost'];

            let macroBuilder = new RollTemplateBuilder('2Epsionic');
            macroBuilder.push(`title=@{${name}}`);
            macroBuilder.push(`discipline=${displayDiscipline}`);
            macroBuilder.push(`tier=${tier}`);
            let attribute = power['attribute'];
            let attributeMatch = attribute.match(/^@{(\w+).*}/);
            if (attributeMatch) {
                attribute = attributeMatch[1];
            } else {
                attribute = 'Affected';
            }
            let modifier = power['modifier'] === '0' ? '' : power['modifier'];
            macroBuilder.push(`powerscoretext=${attribute} ${modifier}`.trim());
            macroBuilder.push(`initial=@{PSP-cost${cost_number}}`);
            macroBuilder.push(`maintenance=@{PSP-cost-maintenance}`);
            macroBuilder.push(`range=${power['range']}`);
            macroBuilder.push(`aoe=${power['aoe']}`);
            let prep = power['prep'];
            let prepMatch = prep.match(/^[1-9]\d*$/);
            if (prepMatch) {
                prep += parseInt(prepMatch[0]) > 1 ? ' rounds' : ' round';
            }
            macroBuilder.push(`prep=${prep}`);
            macroBuilder.push(`prereq=${power['prerequisites']}`);
            macroBuilder.push(`reference=${power['reference']}, ${power['book']}`)
            macroBuilder.push(`powerroll=[[1d20cf20-(@{psionic-mod${number}})]]`);
            if (power['secret-by-dm']) {
                macroBuilder.push('secret=true');
            }
            let powerScore = `@{powerscore-nomod${number}}+(@{powerscore-mod${number}})+(@{psion-armor-penalty})`;
            if (power['context-modifier']) {
                powerScore += `+(${power['context-modifier']})`;
            }
            macroBuilder.push(`powerscore=[[${powerScore}]]`);
            macroBuilder.push(`powerscoreenhanced=[[${powerScore}+(@{powerscore-enhanced})]]`)
            macroBuilder.push(`powerscoreeffect=${power['power-score']}`);
            macroBuilder.push(`20effect=${power['20']}`);
            macroBuilder.push(`1effect=${power['1']}`);
            if (power['damage']) {
                macroBuilder.push(`damage=${power['damage']}`);
                macroBuilder.push(`damage-type=${power['damage-type']}`);
            }
            if (power['healing']) {
                macroBuilder.push(`healing=${power['healing']}`);
            }
            macroBuilder.push('fail=Half of PSP cost (rounded up) is lost.');
            macroBuilder.push(`effects=${power['effect']}`);

            let macroValue = macroBuilder.string();
            powerInfo[`repeating_${section}_${macro}`] = macroValue;

            setAttrs(powerInfo,{silent:true});
        });
    });

    on(`clicked:repeating_${section}:action-check clicked:repeating_${section}:action-check-dm`, function (eventInfo) {
        let parse = parseSourceAttribute(eventInfo);
        getAttrs([`repeating_${section}_${macro}`,
            `repeating_${section}_powerscore-nomod${number}`,
            `repeating_${section}_powerscore-mod${number}`,
            'psion-armor-penalty'
        ], function (values) {
            let displayDiscipline = discipline;
            let tier = name.includes('science') ? 'Science' : 'Devotion';
            let fullMacro = values[`repeating_${section}_${macro}`];
            let match;
            if (discipline === 'Attack' || discipline === 'Defense') {
                displayDiscipline = 'Telepathic';
                match = fullMacro.match(/\{\{tier=(.*?)}} *\{\{/);
                tier = match ? match[1] : '';
            }

            let macroBuilder = new RollTemplateBuilder('2Epsionic');

            match = fullMacro.match(/\{\{(title=.*?)}} *\{\{/);
            if (match) macroBuilder.push(match[1]);
            else macroBuilder.push(`title=@{${name}}`);

            match = fullMacro.match(/\{\{(discipline=.*?)}} *\{\{/);
            if (match) macroBuilder.push(match[1]);
            else macroBuilder.push(`discipline=${displayDiscipline}`);

            match = fullMacro.match(/\{\{(tier=.*?)}} *\{\{/);
            if (match) macroBuilder.push(match[1]);
            else macroBuilder.push(`tier=${tier}`);

            match = fullMacro.match(/\{\{(powerscoretext=.*?)}} *\{\{/);
            if (match) macroBuilder.push(match[1]);
            else {
                let attribute = values[`repeating_${section}_powerscore-nomod${number}`];;
                let attributeMatch = attribute.match(/^@{(\w+).*}/);
                if (attributeMatch) {
                    attribute = attributeMatch[1];
                } else {
                    attribute = 'Affected';
                }
                let modifier = values[`repeating_${section}_powerscore-mod${number}`];
                modifier = modifier === '0' ? '' : modifier;
                macroBuilder.push(`powerscoretext=${attribute} ${modifier}`.trim());
            }

            match = fullMacro.match(/\{\{(powerroll=\[\[.*?]])}} *\{\{/);
            if (match) macroBuilder.push(match[1]);
            else macroBuilder.push(`powerroll=[[1d20cf20-(@{psionic-mod${number}})]]`);

            let powerScore = `@{powerscore-nomod${number}}+(@{powerscore-mod${number}})+(@{psion-armor-penalty})`;
            match = fullMacro.match(/\{\{(powerscore=\[\[.*?]])}} *\{\{/);
            if (match) macroBuilder.push(match[1]);
            else macroBuilder.push(`powerscore=[[${powerScore}]]`);

            match = fullMacro.match(/\{\{(powerscoreenhanced=\[\[.*?]])}} *\{\{/);
            if (match) macroBuilder.push(match[1]);
            else macroBuilder.push(`powerscoreenhanced=[[${powerScore}+(@{powerscore-enhanced})]]`);

            match = fullMacro.match(/\{\{(powerscoreeffect=.*?)}} *\{\{/);
            if (match) macroBuilder.push(match[1]);

            match = fullMacro.match(/\{\{(20effect=.*?)}} *\{\{/);
            if (match) macroBuilder.push(match[1]);

            match = fullMacro.match(/\{\{(1effect=.*?)}} *\{\{/);
            if (match) macroBuilder.push(match[1]);

            match = fullMacro.match(/\{\{(success=.*?)}} *\{\{/)
            if (match) macroBuilder.push(match[1]);

            match = fullMacro.match(/\{\{(fail=.*?)}} *\{\{/)
            if (match) macroBuilder.push(match[1]);

            let macroValue = macroBuilder.string();

            if (parse.attribute.endsWith('dm')) {
                macroValue = `/w gm ${macroValue}`;
            }

            rollPsionicTemplate(macroValue, parse.rowId, values);
        });
    });

    on(`clicked:repeating_${section}:action-macro`, function (eventInfo) {
        let parse = parseSourceAttribute(eventInfo);
        getAttrs([`repeating_${section}_${macro}`, 'psion-armor-penalty', 'character_name'], function (values) {
            let macroValue = values[`repeating_${section}_${macro}`];

            let isSecret = macroValue.match(/\{\{(secret=true)}}/);
            let powerRollMatch = macroValue.match(/\{\{(powerroll=.*?)}} *\{\{/);
            if (isSecret && powerRollMatch) {
                macroValue = macroValue.replace(powerRollMatch[1], `powerroll=[Secret by DM](~${values.character_name}|repeating_${section}_${parse.rowId}_action-check-dm)`)
            }

            rollPsionicTemplate(macroValue, parse.rowId, values);
        });
    });

    let rollPsionicTemplate = async function(macroValue, rowId, values) {
        let repeating = `repeating_${section}_${rowId}`;
        macroValue = macroValue.replaceAll(`${name}`,`${repeating}_${name}`)
            .replaceAll(`psionic-mod${number}`,`${repeating}_psionic-mod${number}`)
            .replaceAll(`powerscore-nomod${number}`,`${repeating}_powerscore-nomod${number}`)
            .replaceAll(`powerscore-mod${number}`,`${repeating}_powerscore-mod${number}`)
            .replaceAll(`powerscore-enhanced`,`${repeating}_powerscore-enhanced`)
            .replaceAll(`PSP-cost${cost_number}`,`${repeating}_PSP-cost${cost_number}`)
            .replaceAll(`PSP-cost-maintenance`,`${repeating}_PSP-cost-maintenance`);

        if (!values['psion-armor-penalty']) {
            macroValue = macroValue.replaceAll('+(@{psion-armor-penalty})', '');
        }

        let roll = await startRoll(macroValue);
        if (!macroValue.includes('&{template:2Epsionic}')) {
            return finishRoll(roll.rollId);
        }

        let computedRolls = {};
        let powerscore = roll.results.powerscore;
        if (powerscore) {
            computedRolls.powerscore = Math.min(powerscore.result, 19)
        }

        let powerscoreenhanced = roll.results.powerscoreenhanced;
        if (powerscoreenhanced && powerscoreenhanced.result > powerscore.result) {
            computedRolls.powerscoreenhanced = Math.min(powerscoreenhanced.result, 19)
            if (powerscoreenhanced.result > 19) {
                computedRolls.powerscore = 19 - (powerscoreenhanced.result - powerscore.result);
            }
        }

        finishRoll(roll.rollId, computedRolls);
    };
});
//#endregion

// Show / Hide buttons for various repeating sections
const FOLDABLE_REPEATING_SECTIONS = [
    ...WIZARD_SPELL_LEVELS_SECTIONS.map(e => e.sections[e.sections.length-1]).map(e => `spells-${e}`),
    'spells-wizmonster',
    ...PRIEST_SPELL_LEVELS_SECTIONS.map(e => e.sections[e.sections.length-1]).map(e => `spells-${e}`),
    'spells-primonster',
    ...PSIONIC_CORE_SECTIONS.map(e => e.section),
    'potions',
    'dusts',
    'scrolls',
];
FOLDABLE_REPEATING_SECTIONS.forEach(section => {
   on(`clicked:repeating_${section}:show clicked:repeating_${section}:hide`, function (eventInfo) {
       let parse = parseSourceAttribute(eventInfo);
       $20(`div[data-reprowid=${parse.rowId}] .sheet-hidden.sheet-fold`).toggleClass('sheet-show');
   });
});

// Fix for Roll20 not handling quotes correctly from sheet.json
const fixQuotes = function (currentValue, attribute, event) {
    if (currentValue.includes('’')) {
        let newValue = {};
        newValue[attribute] = currentValue.replaceAll('’', '\'');
        console.log(`${attribute} was updated via ${event}`);
        setAttrs(newValue,{silent:true});
    }
}

on(BOOK_FIELDS.map(b => `change:${b}`).join(' '), function (eventInfo) {
    if (eventInfo.newValue) {
        fixQuotes(eventInfo.newValue, eventInfo.sourceAttribute, "eventInfo.newValue");
    } else {
        getAttrs([eventInfo.sourceAttribute], function (values) {
            fixQuotes(values[eventInfo.sourceAttribute], eventInfo.sourceAttribute, "getAttrs");
        });
    }
});

// --- ALL SHEET WORKERS END --- //