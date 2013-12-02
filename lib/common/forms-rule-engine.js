var async=require('async');

/*
   NEW WAY

Sample Usage 

var engine = formsRulesEngine(form-definition);

engine.validateAll...
engine.validateForms(form-submission, function(err, res) {});

res:
{
    "validation": {
        "fieldId": {
            "fieldId": "",
            "valid": true,
            "errorMessages": [
                "length should be 3 to 5",
                "should not contain dammit",
                "should repeat at least 2 times"
            ]
        },
        "fieldId1": {

        }
    }
}


OR

engine.validateField(fieldId, submissionJSON, function(err,res) {});
// validate only field values on validation (no rules, no repeat checking)
res:
"validation":{
        "fieldId":{
            "fieldId":"",
            "valid":true,
            "errorMessages":[
                "length should be 3 to 5",
                "should not contain dammit"
            ]
        }
    }

OR

engine.checkRules(submissionJSON, unction(err, res) {})
// check all rules actions
res:
{
    "actions": {
        "pages": {
            "targetId": {
                "targetId": "",
                "action": "show|hide"
            }
        },
        "fields": {

        }
    }
}

*/


var FIELD_TYPE_CHECKBOX = "checkboxes";
var FIELD_TYPE_DATETIME = "dateTime";
var FIELD_TYPE_DATETIME_DATETIMEUNIT_DATEONLY = "date";
var FIELD_TYPE_DATETIME_DATETIMEUNIT_TIMEONLY = "time";
var FIELD_TYPE_DATETIME_DATETIMEUNIT_DATETIME = "dateTime";


var formsRulesEngine = function(formDef) {
  /*
    options.form.submission = form submission data
    options.form.definition = form definition data
  */

  var initialised;

  var definition = formDef;
  var submission;

  var fieldMap = {};
  var fieldRulePredicateMap = {};
  var fieldRuleSubjectMap = {};
  var pageRulePredicateMap = {};
  var pageRuleSubjectMap = {};
  var submissionFieldsMap = {};

  var isRulePredeciate = function(fieldId) {
   /*
    * fieldId = Id of field to check for reule predeciate references 
    */ 
    return !!rulePredicateMap[fieldId];
  };

  var isFieldRuleSubject = function(fieldId) {
   /*
    * fieldId = Id of field to check for reule subject references 
    */ 
    return !!fieldRuleSubjectMap[fieldId];
  };

  var isPageRuleSubject = function(pageId) {
   /*
    * pageId = Id of page to check for rule subject references 
    */ 
    return !!pageRuleSubjectMap[pageId];
  };

  /* Private functions */
  function buildFieldMap(cb) {
    // Iterate over all fields in form definition & build fieldMap
    async.each(definition.pages, function(page, cbPages) {
      async.each(page.fields, function(field, cbFields) {
        field.pageId = page._id;
        fieldMap[field._id] = field;
        return cbFields();
      }, function (err) {
        return cbPages();
      });
    }, cb);
  }

  function buildFieldRuleMaps(cb) {
    // Itterate over all rules in form definition & build ruleSubjectMap 
    // and rulePredicateMap keyed on field id with array of rule ids - e.g.
    //    ruleSubjectMap[fieldId] = ruleSubjectMap[fieldId] || [];
    //    ruleSubjectMap[fieldId].push(ruleId);

    async.each(definition.fieldRules, function(rule, cbRules) {
      async.each(rule.ruleConditionalStatements, function(ruleConditionalStatement, cbRuleConditionalStatements) {
        var fieldId = ruleConditionalStatement.sourceField;
        fieldRulePredicateMap[fieldId] = fieldRulePredicateMap[fieldId] || [];
        fieldRulePredicateMap[fieldId].push(rule);
        return cbRuleConditionalStatements();
      }, function (err) {
        fieldRuleSubjectMap[rule.targetField] = fieldRuleSubjectMap[rule.targetField] || [];
        fieldRuleSubjectMap[rule.targetField].push(rule);
        return cbRules();
      });
    }, cb);  
  }

  function buildPageRuleMap(cb) {
    // Itterate over all rules in form definition & build ruleSubjectMap 
    // and rulePredicateMap keyed on field id with array of rule ids - e.g.
    //    ruleSubjectMap[fieldId] = ruleSubjectMap[fieldId] || [];
    //    ruleSubjectMap[fieldId].push(ruleId);

    async.each(definition.pageRules, function(rule, cbRules) {
      var rulesId = rule._id;
      async.each(rule.ruleConditionalStatements, function(ruleConditionalStatement, cbRulePredicates) {
        var fieldId = ruleConditionalStatement.sourceField;
        pageRulePredicateMap[fieldId] = pageRulePredicateMap[fieldId] || [];
        pageRulePredicateMap[fieldId].push(rule);
        return cbRulePredicates();
      }, function (err) {
        pageRuleSubjectMap[rule.targetPage] = pageRuleSubjectMap[rule.targetPage] || [];
        pageRuleSubjectMap[rule.targetPage].push(rule);
        return cbRules();
      });
    }, cb);
  }

  function buildSubmissionFieldsMap(cb) {
    // iterate over all the fields in the submissions and build a map for easier lookup
    //  "formFields":[
    //    {
    //       "fieldId":"528a5f96fd026bc578000058",
    //       "fieldValues":[
    //          "test1",
    //          "test2"
    //       ]
    //    }
    //  ]
    async.each(submission.formFields, function(formField, cb) {
      if (!formField.fieldId) return cb(new Error("No fieldId in this submission entry: " + util.inspect(formField)));

      submissionFieldsMap[formField.fieldId] = formField.fieldValues;
      return cb();
    }, cb);
  }

  function init(cb) {
    if(initialised) return cb();
    async.parallel([
      buildFieldMap,
      buildFieldRuleMaps,
      buildPageRuleMap
    ], function(err) {
      if (err) return cb(err);
      initialised = true;
      return cb();
    });
  }

  function initSubmission(formSubmission, cb) {
    init(function(err){
      if (err) return cb(err);

      submission = formSubmission;
      buildSubmissionFieldsMap(cb);
    });
  }

  function validateForm(cb) {
    init(function(err){
      if (err) return cb(err);

      var res = {"errors":[]};
      // for each field, call validateField
      async.each(submission.formFields, function(item, callback) {
        validateField({"fieldId":item._id}, function(err, fieldRes) {
          if(err) {
            res.errors.push(err);
          }
          return callback();
        });

      }, function(err) {
        if( err ) {
          return cb(err);
        }
        return cb(null, res);
      });

    });
  }

  function validateField(fieldId, cb) {
    /*
     * fieldId = Id of field to check for reule predeciate references 
     */
    init(function(err){
      if (err) return cb(err);

      return cb(new Error("Not Implemented - validateField"));

    });
  }

  function isFieldRequired(fieldId, cb) {
    /*
     * fieldId = Id of field to check for reule predeciate references 
     */ 
    init(function(err){
      if (err) return cb(err);

      return cb(new Error("Not Implemented - isFieldRequired"));

    });
  }


  function rulesResult(rules, cb) {
    var visible = true;

    // Itterate over each rule that this field is a predicate of
    async.each(rules, function(rule, cbRule) {
      // For each rule, itterate over the predicate fields and evaluate the rule
      var predicateMapQueries = [];
      var predicateMapPassed = [];
      async.each(rule.ruleConditionalStatements, function(ruleConditionalStatement, cbPredicates) {
        var field = fieldMap[ruleConditionalStatement.sourceField];
        var submissionValues = submissionFieldsMap[ruleConditionalStatement.sourceField] || [];
        var condition = ruleConditionalStatement.restriction;
        var testValue = ruleConditionalStatement.sourceValue;

        // Validate rule predictes on the first entry only.
        var passed = isConditionActive(field, submissionValues[0], testValue, condition);
        predicateMapQueries.push({"field": field, 
                                  "submissionValues": submissionValues, 
                                  "condition": condition,
                                  "testValue": testValue,
                                  "passed" : passed
                                });

        if( passed ) {
          predicateMapPassed.push(field);
        }
        return cbPredicates();
      }, function(err) {
        if(err) cbRule(err);

        function rulesPassed (condition, passed, quesies) {
          return ( (condition === "and" ) && (( passed.length == quesies.length ))) ||  // "and" condition - all rules must pass
           ( (condition === "or" )  && (( passed.length > 0 )));                        // "or" condition - only one rule must pass
        }

        if (rulesPassed(rule.ruleConditionalOperator, predicateMapPassed, predicateMapQueries)) {
          visible = (rule.type === "show");
        } else {
          visible = (rule.type !== "show");
        }
        return cbRule();
      });
    }, function(err) {
      if (err) return cb(err);

      return cb(undefined, visible);
    });
  }

  function isPageVisible(pageId, cb) {
    init(function(err){
      if (err) return cb(err);

      if (isPageRuleSubject(pageId)) {  // if the page is the target of a rule
        return rulesResult(pageRuleSubjectMap[pageId], cb);  // execute page rules
      } else {
        return cb(undefined, true);  // if page is not subject of any rule then must be visible
      }
    });
  }

  function isFieldVisible(fieldId, checkContainingPage, cb) {
    /*
     * fieldId = Id of field to check for reule predeciate references 
     * checkContainingPage = if true check page containing field, and return false if the page is hidden
     */
    init(function(err){
      if (err) return cb(err);

      // Fields are visable by default
      var visible = true;

      var field = fieldMap[fieldId];
      if (!fieldId) return cb(new Error("Field does not exist in form"));

      async.waterfall([
        function testPage(cb) {
          if (checkContainingPage) {
            isPageVisible(field.pageId, cb);
          } else {
            return cb(undefined, true);
          }
        },
        function testField(pageVisible, cb) {
          if (!pageVisible) {  // if page containing field is not visible then don't need to check field
            return cb(undefined, false);
          }

          if (isFieldRuleSubject(fieldId) ) { // If the field is the subject of a rule it may have been hidden
            return rulesResult(fieldRuleSubjectMap[fieldId], cb);  // execute field rules
          } else {
            return cb(undefined, true); // if not subject of field rules then can't be hidden 
          }
        }
      ], cb);
    });
  }

  // // check all rules actions
  // res:
  // {
  //     "actions": {
  //         "pages": {
  //             "targetId": {
  //                 "targetId": "",
  //                 "action": "show|hide"
  //             }
  //         },
  //         "fields": {
  //         }
  //     }
  function checkRules(submissionJSON, cb) {
    init(function(err){
      if (err) return cb(err);

      initSubmission(submissionJSON, function (err) {
        if(err) return cb(err);
        var actions = {};

        async.parallel([
          function (cb) {
            actions.fields = {};
            async.eachSeries(Object.keys(fieldRuleSubjectMap), function (fieldId, cb) {
              isFieldVisible(fieldId, false, function (err, fieldVisible) {
                actions.fields[fieldId] = {targetId: fieldId, action: (fieldVisible?"show":"hide")};
                return cb();
              });
            }, cb);
          },
          function (cb) {
            actions.pages = {};
            async.eachSeries(Object.keys(pageRuleSubjectMap), function (pageId, cb) {
              isPageVisible(pageId, function (err, pageVisible) {
                actions.pages[pageId] = {targetId: pageId, action: (pageVisible?"show":"hide")};
                return cb();
              });
            }, cb);
          }
        ], function (err) {
          if(err) return cb(err);

          return cb(undefined, {actions: actions});
        });
      });
    });
  }

  return {
    initSubmission: initSubmission,

    validateForm: validateForm,

    validateField: validateField,

    isFieldRequired: isFieldRequired,

    isFieldVisible: isFieldVisible,

    isConditionActive: isConditionActive,

    checkRules: checkRules
  };
};

function isConditionActive(field, fieldValue, testValue, condition) {

  var fieldType = field.type;
  var fieldOptions = field.fieldOptions;

  var valid = true;
  // Possible conditions:
  // "is not","is equal to","is greater than","is less than","is at",
  // "is before","is after","is", "contains", "does not contain", 
  // "begins with", "ends with"

  if( "is equal to" === condition) {
    valid = fieldValue === testValue;
  }
  else if( "is greater than" === condition) {
    // TODO - do numeric checking
    valid = fieldValue > testValue;
  }
  else if( "is less than" === condition) {
    // TODO - do numeric checking
    valid = fieldValue < testValue;
  }
  else if( "is at" === condition) {
    valid = false;
    if( fieldType === FIELD_TYPE_DATETIME ) {
      switch (fieldOptions.dateTimeUnit)
      {
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATEONLY:
        try{
          valid = (new Date(new Date(fieldValue).toDateString()).getTime() == new Date(new Date(testValue).toDateString()).getTime()); 
        }catch(e){
          valid = false;
        }
        break;
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_TIMEONLY:

        break;
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATETIME:
        try{
          valid = (new Date(fieldValue).getTime() == new Date(testValue).getTime()); 
        }catch(e){
          valid = false;
        }
        break;
      default:
        valid = false;  // TODO should raise error here?
        break;
      }
    }
  }
  else if( "is before" === condition) {
    valid = false;
    if( fieldType === FIELD_TYPE_DATETIME ) {
     switch (fieldOptions.dateTimeUnit)
      {
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATEONLY:
        try{
          valid = (new Date(new Date(fieldValue).toDateString()).getTime() < new Date(new Date(testValue).toDateString()).getTime()); 
        }catch(e){
          valid = false;
        }
        break;
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_TIMEONLY:

        break;
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATETIME:
        try{
          valid = (new Date(fieldValue).getTime() < new Date(testValue).getTime()); 
        }catch(e){
          valid = false;
        }
        break;
      default:
        valid = false;  // TODO should raise error here?
        break;
      }
    }
  }
  else if( "is after" === condition) {
    valid = false;
    if( fieldType === FIELD_TYPE_DATETIME ) {
     switch (fieldOptions.dateTimeUnit)
      {
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATEONLY:
        try{
          valid = (new Date(new Date(fieldValue).toDateString()).getTime() > new Date(new Date(testValue).toDateString()).getTime()); 
        }catch(e){
          valid = false;
        }
        break;
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_TIMEONLY:

        break;
      case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATETIME:
        try{
          valid = (new Date(fieldValue).getTime() > new Date(testValue).getTime());
        }catch(e){
          valid = false;
        } 
        break;
      default:
        valid = false;  // TODO should raise error here?
        break;
      }
    }
  }
  else if( "is" === condition) {
    if (fieldType === FIELD_TYPE_CHECKBOX) {
      valid = fieldValue && fieldValue.selections && fieldValue.selections.indexOf(testValue) !== -1;
    } else {
      valid = fieldValue === testValue;
    }
  }
  else if( "is not" === condition) {
    if (fieldType === FIELD_TYPE_CHECKBOX) {
      valid = fieldValue && fieldValue.selections && fieldValue.selections.indexOf(testValue) === -1;
    } else {
      valid = fieldValue !== testValue;
    }
  }
  else if( "contains" === condition) {
    valid = fieldValue.indexOf(testValue) !== -1;
  }
  else if( "does not contain" === condition) {
      valid = fieldValue.indexOf(testValue) === -1;
  }
  else if( "begins with" === condition) {
    valid = fieldValue.substring(0, testValue.length) === testValue;
  }
  else if( "ends with" === condition) {
    valid = fieldValue.substring(Math.max(0, (fieldValue.length - testValue.length)), fieldValue.length) === testValue;
  }
  else {
    valid = false;
  }

  return valid;
}

module.exports = formsRulesEngine;